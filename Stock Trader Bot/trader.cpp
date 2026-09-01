/**
 * Stock Trader Bot
 *
 * A paper-trading bot: it reads a watchlist, asks a Python ML model whether each
 * symbol looks like a buy, sizes positions against a risk budget, applies exit
 * rules to what it already holds, and records the result to a local log. It does
 * not connect to a broker and never places a real order.
 *
 *   ./trader              run and update portfolio_state.json
 *   ./trader --dry-run    evaluate and print, writing nothing
 */

#include <iostream>
#include <vector>
#include <string>
#include <fstream>
#include <iomanip>
#include <map>
#include <sstream>
#include <thread>
#include <chrono>
#include <nlohmann/json.hpp>
#include <cstdlib>
#include <cstdio>
#include <memory>
#include <ctime>
#include <algorithm>

using json = nlohmann::json;

std::vector<std::string> loadWatchlist(const std::string& filename) {
    std::vector<std::string> symbols;
    std::ifstream file(filename);
    std::string ticker;

    if (!file.is_open()) {
        std::cerr << "Error: Could not open " << filename << ". Using default tickers." << std::endl;
        return {"AAPL", "VOO"};
    }

    while (file >> ticker) {
        if (!ticker.empty()) {
            symbols.push_back(ticker);
        }
    }

    file.close();
    return symbols;
}

/**
 * MLPredictor: Interface to the Python ML model for stock predictions.
 * Calls ml_model/predict.py as a subprocess and parses the JSON result.
 */
class MLPredictor {
private:
    std::string mlScriptPath;
    bool modelReady;

public:
    struct Prediction {
        std::string ticker;
        bool buySignal;
        double confidence;
        double probability;
        double latestPrice;
        double volatility;
        std::string status;

        Prediction()
            : ticker(""),
              buySignal(false),
              confidence(0.0),
              probability(0.0),
              latestPrice(0.0),
              volatility(0.0),
              status("model_not_ready") {}

        bool ok() const { return status == "success" && latestPrice > 0.0; }
    };

    MLPredictor(std::string scriptPath = "ml_model/predict.py")
        : mlScriptPath(scriptPath), modelReady(false) {
        std::ifstream modelFile("ml_model/models/stock_classifier.pkl");
        modelReady = modelFile.good();
        if (!modelReady) {
            std::cerr << "[ML] WARNING: Model files not found. Run ml_model/setup.sh first." << std::endl;
        }
    }

    Prediction predictForTicker(const std::string& ticker) {
        Prediction result;
        result.ticker = ticker;

        if (!modelReady) {
            return result;
        }

        try {
            const char* pythonBinEnv = std::getenv("PYTHON_BIN");
            std::string pythonCmd = (pythonBinEnv && *pythonBinEnv)
                ? std::string("\"") + pythonBinEnv + "\""
                : "python3";

            std::string cmd = "cd ml_model && " + pythonCmd + " predict.py " + ticker + " 2>&1";

            std::shared_ptr<FILE> pipe(popen(cmd.c_str(), "r"), pclose);
            if (!pipe) {
                result.status = "execution_failed";
                return result;
            }

            char buffer[256];
            std::string output;
            while (fgets(buffer, sizeof(buffer), pipe.get()) != nullptr) {
                output += buffer;
            }

            if (output.empty()) {
                result.status = "empty_output";
                return result;
            }

            json predictions;
            try {
                predictions = json::parse(output);
            } catch (const std::exception&) {
                std::replace(output.begin(), output.end(), '\n', ' ');
                std::replace(output.begin(), output.end(), '\r', ' ');
                if (output.size() > 120) {
                    output = output.substr(0, 117) + "...";
                }
                result.status = std::string("subprocess_error: ") + output;
                return result;
            }

            result.ticker = predictions.value("ticker", ticker);
            result.buySignal = predictions.value("buy_signal", false);
            result.confidence = predictions.value("confidence", 0.0);
            result.probability = predictions.value("probability", 0.0);
            result.status = predictions.value("status", "unknown");
            result.latestPrice = predictions.value("latest_price", 0.0);
            result.volatility = predictions.value("volatility", 0.0);

            return result;

        } catch (const std::exception& e) {
            result.status = std::string("error: ") + e.what();
            return result;
        }
    }

    bool isReady() const {
        return modelReady;
    }
};

/**
 * One open position.
 *
 * avgCost is the weighted average paid per share. It is 0 when unknown, which
 * happens for positions carried over from the earlier state format that stored
 * only a share count. Exit rules that need a cost basis are skipped for those
 * rather than computed against a fake zero.
 */
struct Position {
    double shares = 0.0;
    double avgCost = 0.0;

    bool hasCostBasis() const { return avgCost > 0.0; }
};

struct PortfolioState {
    double cashUsd = 0.0;
    std::map<std::string, Position> positions;

    /**
     * Reads both the current format, {"shares": n, "avg_cost": n}, and the
     * earlier one that stored a bare share count per ticker.
     */
    static PortfolioState load(const std::string& path) {
        PortfolioState st;
        std::ifstream f(path);
        if (!f.is_open()) {
            return st;
        }

        json j;
        try {
            f >> j;
        } catch (const std::exception& e) {
            std::cerr << "Error: could not parse " << path << " (" << e.what() << "). Starting empty." << std::endl;
            return st;
        }

        st.cashUsd = j.value("cash_usd", 0.0);

        if (j.contains("holdings") && j["holdings"].is_object()) {
            for (auto& [ticker, value] : j["holdings"].items()) {
                Position p;
                if (value.is_object()) {
                    p.shares = value.value("shares", 0.0);
                    p.avgCost = value.value("avg_cost", 0.0);
                } else if (value.is_number()) {
                    // Legacy: share count only, so the cost basis is unknown.
                    p.shares = value.get<double>();
                    p.avgCost = 0.0;
                }
                if (p.shares > 0.0) {
                    st.positions[ticker] = p;
                }
            }
        }
        return st;
    }

    void save(const std::string& path) const {
        json j;
        j["cash_usd"] = cashUsd;

        json holdings = json::object();
        for (const auto& [ticker, position] : positions) {
            if (position.shares <= 0.0) continue;
            holdings[ticker] = {
                {"shares", position.shares},
                {"avg_cost", position.avgCost},
            };
        }
        j["holdings"] = holdings;

        std::ofstream f(path);
        f << std::setw(2) << j << "\n";
    }
};

/** Why the bot decided to close or trim a position. */
struct SellDecision {
    bool sell = false;
    double shares = 0.0;
    std::string reason;
};

class PortfolioManager {
private:
    std::string logFileName;
    double riskThreshold;
    double mlConfidenceThreshold;
    double stopLossPct;
    double takeProfitPct;
    bool mlSellEnabled;
    double mlSellConfidence;
    bool dryRun;

    std::vector<std::string> watchlist;
    MLPredictor mlPredictor;

    PortfolioState state;
    std::string stateFile;

    std::map<std::string, MLPredictor::Prediction> predictionCache;

public:
    PortfolioManager(std::string file,
                     double risk,
                     double mlThreshold,
                     double stopLoss,
                     double takeProfit,
                     bool sellOnMlSignal,
                     double sellConfidence,
                     bool dry,
                     std::string statePath = "portfolio_state.json")
        : logFileName(file),
          riskThreshold(risk),
          mlConfidenceThreshold(mlThreshold),
          stopLossPct(stopLoss),
          takeProfitPct(takeProfit),
          mlSellEnabled(sellOnMlSignal),
          mlSellConfidence(sellConfidence),
          dryRun(dry),
          mlPredictor("ml_model/predict.py"),
          stateFile(statePath) {
        state = PortfolioState::load(stateFile);
    }

    void addToWatchlist(std::string ticker) {
        watchlist.push_back(ticker);
    }

    /**
     * Append a trade to the CSV log.
     *
     * Columns are date,ticker,price,shares,total,side. `side` was added last so
     * that rows written before the bot could sell still parse — a row with only
     * five fields is a buy.
     */
    void logTrade(const std::string& ticker, double price, double shares, const std::string& side) {
        if (dryRun) return;

        std::ofstream outFile(logFileName, std::ios::app);
        if (outFile.is_open()) {
            std::time_t t = std::time(nullptr);
            char ts[20];
            std::strftime(ts, sizeof(ts), "%Y-%m-%d", std::localtime(&t));

            // Explicit precision: the default would round fractional shares and
            // could emit scientific notation, neither of which round-trips.
            outFile << std::fixed;
            outFile << ts << "," << ticker
                    << "," << std::setprecision(4) << price
                    << "," << std::setprecision(8) << shares
                    << "," << std::setprecision(2) << (price * shares)
                    << "," << side << "\n";
            outFile.close();
        }
    }

    /** Fetch a prediction once per ticker per run. */
    const MLPredictor::Prediction& prediction(const std::string& ticker) {
        auto it = predictionCache.find(ticker);
        if (it != predictionCache.end()) {
            return it->second;
        }

        auto result = mlPredictor.predictForTicker(ticker);
        std::this_thread::sleep_for(std::chrono::seconds(1));
        return predictionCache.emplace(ticker, result).first->second;
    }

    /** Portfolio value using whatever prices this run has seen. */
    double totalPortfolioValue() const {
        double total = state.cashUsd;
        for (const auto& [ticker, position] : state.positions) {
            auto it = predictionCache.find(ticker);
            if (it != predictionCache.end() && it->second.ok()) {
                total += position.shares * it->second.latestPrice;
            } else {
                // No live price this run: fall back to cost so an unpriced
                // position does not silently vanish from the risk denominator.
                total += position.shares * position.avgCost;
            }
        }
        return total;
    }

    /**
     * Exit rules, in order of precedence.
     *
     * Stop-loss runs first because capping a loss matters more than realizing a
     * gain. Both need a cost basis; positions carried over without one are left
     * alone rather than evaluated against a meaningless 0.
     */
    SellDecision evaluateSell(const std::string& ticker,
                              const Position& position,
                              const MLPredictor::Prediction& pred) const {
        SellDecision decision;

        if (!pred.ok() || position.shares <= 0.0) {
            return decision;
        }

        if (position.hasCostBasis()) {
            const double returnPct = (pred.latestPrice - position.avgCost) / position.avgCost;

            if (stopLossPct > 0.0 && returnPct <= -stopLossPct) {
                decision.sell = true;
                decision.shares = position.shares;
                std::ostringstream reason;
                reason << "stop loss (" << std::fixed << std::setprecision(1)
                       << (returnPct * 100.0) << "% vs -" << (stopLossPct * 100.0) << "% limit)";
                decision.reason = reason.str();
                return decision;
            }

            if (takeProfitPct > 0.0 && returnPct >= takeProfitPct) {
                decision.sell = true;
                decision.shares = position.shares;
                std::ostringstream reason;
                reason << "take profit (+" << std::fixed << std::setprecision(1)
                       << (returnPct * 100.0) << "% vs +" << (takeProfitPct * 100.0) << "% target)";
                decision.reason = reason.str();
                return decision;
            }
        }

        // Off by default. The classifier scores F1 0.42 / ROC-AUC 0.657 on its
        // own test split, which is thin evidence on which to close a position.
        if (mlSellEnabled && !pred.buySignal && pred.confidence >= mlSellConfidence) {
            decision.sell = true;
            decision.shares = position.shares;
            std::ostringstream reason;
            reason << "model exit signal (confidence " << std::fixed << std::setprecision(2)
                   << pred.confidence << ")";
            decision.reason = reason.str();
        }

        return decision;
    }

    /** Close or trim positions whose exit rules have triggered. */
    void runExits() {
        std::cout << "--- Exit Rules ---" << std::endl;

        if (state.positions.empty()) {
            std::cout << "(no open positions)" << std::endl;
            std::cout << std::endl;
            return;
        }

        std::vector<std::string> closed;

        for (auto& [ticker, position] : state.positions) {
            const auto& pred = prediction(ticker);

            if (!pred.ok()) {
                std::cout << "  " << ticker << ": no price this run [status: " << pred.status << "]" << std::endl;
                continue;
            }

            if (!position.hasCostBasis()) {
                std::cout << "  " << ticker << ": holding, cost basis unknown (exit rules skipped)" << std::endl;
                continue;
            }

            const double returnPct = (pred.latestPrice - position.avgCost) / position.avgCost;
            const SellDecision decision = evaluateSell(ticker, position, pred);

            std::cout << "  " << ticker << ": " << std::fixed << std::setprecision(2)
                      << pred.latestPrice << " vs cost " << position.avgCost
                      << " (" << std::showpos << std::setprecision(1) << (returnPct * 100.0) << "%"
                      << std::noshowpos << ")";

            if (!decision.sell) {
                std::cout << " -> hold" << std::endl;
                continue;
            }

            const double proceeds = decision.shares * pred.latestPrice;
            const double realized = decision.shares * (pred.latestPrice - position.avgCost);

            std::cout << " -> SELL " << std::setprecision(6) << decision.shares
                      << " shares, " << decision.reason << std::endl;
            std::cout << "      proceeds $" << std::setprecision(2) << proceeds
                      << ", realized " << std::showpos << realized << std::noshowpos << std::endl;

            state.cashUsd += proceeds;
            position.shares -= decision.shares;

            logTrade(ticker, pred.latestPrice, decision.shares, "SELL");

            if (position.shares <= 1e-9) {
                closed.push_back(ticker);
            }
        }

        for (const auto& ticker : closed) {
            state.positions.erase(ticker);
        }

        std::cout << std::endl;
    }

    /** Evaluate the watchlist and open or add to positions. */
    void runEntries() {
        std::cout << "--- Entry Rules ---" << std::endl;

        for (const auto& ticker : watchlist) {
            const auto& pred = prediction(ticker);

            std::cout << "  " << ticker << ": buy=" << (pred.buySignal ? "YES" : "NO")
                      << " confidence=" << std::fixed << std::setprecision(2) << pred.confidence;

            if (pred.status != "success") {
                std::cout << " [status: " << pred.status << "]" << std::endl;
                continue;
            }

            if (!(pred.latestPrice > 0.0)) {
                std::cout << " -> SKIP (no valid price)" << std::endl;
                continue;
            }

            const double price = pred.latestPrice;
            std::cout << " price=$" << price;

            if (!pred.buySignal) {
                std::cout << " -> SKIP (model does not signal a buy)" << std::endl;
                continue;
            }

            if (pred.confidence < mlConfidenceThreshold) {
                std::cout << " -> SKIP (below confidence threshold " << mlConfidenceThreshold << ")" << std::endl;
                continue;
            }

            // Keep a slice of cash unspent so the bot is never fully invested.
            const double cashBufferPct = 0.05;
            const double minCashToKeep = state.cashUsd * cashBufferPct;
            const double spendableCash = state.cashUsd - minCashToKeep;

            if (spendableCash <= 0.0) {
                std::cout << " -> SKIP (no spendable cash, 5% buffer enforced)" << std::endl;
                continue;
            }

            const double portfolioValue = totalPortfolioValue();
            Position& position = state.positions[ticker];

            const double currentValue = position.shares * price;
            const double maxAllowed = riskThreshold * portfolioValue;
            const double roomLeft = std::max(0.0, maxAllowed - currentValue);

            // Conviction sizes the buy; the risk cap and the buffer bound it.
            double allocation = std::min({spendableCash * pred.confidence, roomLeft, spendableCash});

            if (allocation <= 0.0) {
                std::cout << " -> SKIP (risk cap or buffer reached)" << std::endl;
                continue;
            }

            double sharesToBuy = allocation / price;
            double cost = sharesToBuy * price;

            if (state.cashUsd - cost < minCashToKeep) {
                cost = state.cashUsd - minCashToKeep;
                sharesToBuy = (cost > 0.0) ? (cost / price) : 0.0;
            }

            if (sharesToBuy <= 0.0) {
                std::cout << " -> SKIP (buffer leaves no room)" << std::endl;
                continue;
            }

            std::cout << " -> BUY " << std::setprecision(6) << sharesToBuy
                      << " shares @ $" << std::setprecision(2) << price
                      << " (cost $" << cost << ")" << std::endl;

            const double totalShares = position.shares + sharesToBuy;

            if (position.shares > 0.0 && !position.hasCostBasis()) {
                // Part of this position was carried over without a cost basis.
                // Averaging the known price against an unknown one treated as
                // zero would invent a basis far below what was actually paid,
                // and the exit rules would then read a fictitious gain and sell.
                // Leave it unknown until a human fills it in.
                std::cout << "      (cost basis still unknown for " << ticker
                          << "; set avg_cost in portfolio_state.json to enable exit rules)" << std::endl;
                position.avgCost = 0.0;
            } else {
                position.avgCost = (position.shares * position.avgCost + sharesToBuy * price) / totalShares;
            }

            position.shares = totalShares;
            state.cashUsd -= cost;

            logTrade(ticker, price, sharesToBuy, "BUY");
        }

        std::cout << std::endl;
    }

    void performRiskAudit() {
        std::cout << "--- Risk & Diversification Audit ---" << std::endl;

        if (state.positions.empty()) {
            std::cout << "(no open positions)" << std::endl;
            return;
        }

        const double portfolioValue = totalPortfolioValue();
        if (portfolioValue <= 0.0) {
            std::cout << "(portfolio value is zero; nothing to audit)" << std::endl;
            return;
        }

        std::cout << "Total Portfolio Value: $" << std::fixed << std::setprecision(2)
                  << portfolioValue << std::endl;
        std::cout << "Cash: $" << state.cashUsd << " ("
                  << (state.cashUsd / portfolioValue * 100.0) << "%)" << std::endl;

        for (const auto& [ticker, position] : state.positions) {
            auto it = predictionCache.find(ticker);
            const bool priced = it != predictionCache.end() && it->second.ok();
            const double price = priced ? it->second.latestPrice : position.avgCost;

            if (price <= 0.0) {
                std::cout << ticker << ": no price or cost available" << std::endl;
                continue;
            }

            const double value = position.shares * price;
            const double weight = value / portfolioValue;

            std::cout << ticker << ": $" << value << " (" << (weight * 100.0) << "%)";
            if (!priced) std::cout << " [at cost]";
            if (weight > riskThreshold) std::cout << " [!] OVER LIMIT";
            std::cout << std::endl;
        }
    }

    void persist() {
        if (dryRun) {
            std::cout << "\n[dry run] portfolio_state.json was not modified." << std::endl;
            return;
        }
        state.save(stateFile);
        std::cout << "\nUpdated Cash Balance: $" << std::fixed << std::setprecision(2)
                  << state.cashUsd << std::endl;
    }
};

static double readEnvDouble(const char* name, double fallback) {
    if (const char* v = std::getenv(name)) {
        try {
            return std::stod(v);
        } catch (...) {
            return fallback;
        }
    }
    return fallback;
}

static bool readEnvBool(const char* name, bool fallback) {
    const char* v = std::getenv(name);
    if (!v || !*v) return fallback;
    std::string value(v);
    std::transform(value.begin(), value.end(), value.begin(), ::tolower);
    return value == "1" || value == "true" || value == "yes" || value == "on";
}

int main(int argc, char** argv) {
    bool dryRun = false;
    for (int i = 1; i < argc; ++i) {
        std::string arg(argv[i]);
        if (arg == "--dry-run" || arg == "-n") {
            dryRun = true;
        } else if (arg == "--help" || arg == "-h") {
            std::cout << "Usage: trader [--dry-run]\n\n"
                      << "  --dry-run, -n   Evaluate and print without writing state or the trade log\n"
                      << "  --help,    -h   Show this message\n\n"
                      << "Configuration is read from the environment; see config.env.example.\n";
            return 0;
        } else {
            std::cerr << "Unknown argument: " << arg << " (try --help)" << std::endl;
            return 1;
        }
    }

    dryRun = dryRun || readEnvBool("DRY_RUN", false);

    const double risk = readEnvDouble("RISK_THRESHOLD", 0.25);
    const double mlThreshold = readEnvDouble("ML_CONFIDENCE_THRESHOLD", 0.55);
    const double stopLoss = readEnvDouble("STOP_LOSS_PCT", 0.15);
    const double takeProfit = readEnvDouble("TAKE_PROFIT_PCT", 0.30);
    const bool mlSell = readEnvBool("ML_SELL_ENABLED", false);
    const double mlSellConfidence = readEnvDouble("ML_SELL_CONFIDENCE", 0.70);

    PortfolioManager bot("portfolio_log.csv", risk, mlThreshold, stopLoss, takeProfit,
                         mlSell, mlSellConfidence, dryRun);

    std::vector<std::string> tickers = loadWatchlist("watchlist.txt");

    std::cout << "=== Stock Trader Bot ===" << std::endl;
    if (dryRun) std::cout << "DRY RUN - no state or log will be written" << std::endl;
    std::cout << "Watchlist: " << tickers.size() << " tickers" << std::endl;
    std::cout << "Entry confidence >= " << std::fixed << std::setprecision(2) << mlThreshold
              << " | Max position " << (risk * 100.0) << "%" << std::endl;
    std::cout << "Stop loss -" << (stopLoss * 100.0) << "% | Take profit +" << (takeProfit * 100.0) << "%"
              << " | Model exits " << (mlSell ? "on" : "off") << std::endl;
    std::cout << std::endl;

    for (const auto& ticker : tickers) {
        bot.addToWatchlist(ticker);
    }

    // Exits before entries, so cash freed by a sale is available to redeploy.
    bot.runExits();
    bot.runEntries();
    bot.performRiskAudit();
    bot.persist();

    return 0;
}
