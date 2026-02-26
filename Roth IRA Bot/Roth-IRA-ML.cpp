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
#include <algorithm> // std::min, std::max

using json = nlohmann::json;

std::vector<std::string> loadWatchlist(const std::string& filename) {
    std::vector<std::string> symbols;
    std::ifstream file(filename);
    std::string ticker;

    if (!file.is_open()) {
        std::cerr << "Error: Could not open " << filename << ". Using default tickers." << std::endl;
        return {"AAPL", "VOO"}; // Fallback defaults
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
 * MLPredictor: Interface to Python ML model for stock predictions
 * Calls ml_model/predict.py as subprocess and parses JSON results
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
    };

    MLPredictor(std::string scriptPath = "ml_model/predict.py")
        : mlScriptPath(scriptPath), modelReady(false) {
        // Check if model files exist
        std::ifstream modelFile("ml_model/models/stock_classifier.pkl");
        modelReady = modelFile.good();
        if (!modelReady) {
            std::cerr << "[ML] WARNING: Model files not found. Run ml_model/setup.sh first." << std::endl;
        }
    }

    /**
     * Execute Python inference script and parse result
     */
    Prediction predictForTicker(const std::string& ticker) {
        Prediction result;
        result.ticker = ticker;

        if (!modelReady) {
            return result;
        }

        try {
            // Execute: python3 ml_model/predict.py TICKER
            std::string cmd = "cd ml_model && ./venv/bin/python predict.py " + ticker + " 2>/dev/null";

            // Execute and capture output
            std::shared_ptr<FILE> pipe(popen(cmd.c_str(), "r"), pclose);
            if (!pipe) {
                result.status = "execution_failed";
                return result;
            }

            // Read Python subprocess output
            char buffer[256];
            std::string output;
            while (fgets(buffer, sizeof(buffer), pipe.get()) != nullptr) {
                output += buffer;
            }

            if (output.empty()) {
                result.status = "empty_output";
                return result;
            }

            // Parse JSON result
            auto predictions = json::parse(output);

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

struct PortfolioState {
    double cashUsd = 0.0;
    std::map<std::string, double> shares; // ticker -> shares

    static PortfolioState load(const std::string& path) {
        PortfolioState st;
        std::ifstream f(path);
        if (!f.is_open()) {
            // If missing, default to $0 and empty holdings
            return st;
        }
        json j;
        f >> j;

        st.cashUsd = j.value("cash_usd", 0.0);

        if (j.contains("holdings") && j["holdings"].is_object()) {
            for (auto& [k, v] : j["holdings"].items()) {
                st.shares[k] = v.get<double>();
            }
        }
        return st;
    }

    void save(const std::string& path) const {
        json j;
        j["cash_usd"] = cashUsd;
        json h = json::object();
        for (const auto& [ticker, sh] : shares) {
            h[ticker] = sh;
        }
        j["holdings"] = h;

        std::ofstream f(path);
        f << std::setw(2) << j << "\n";
    }
};

class PortfolioManager {
private:
    std::string logFileName;
    double riskThreshold;
    double mlConfidenceThreshold; // Only buy if ML confidence > this
    std::vector<std::string> watchlist;
    MLPredictor mlPredictor;

    PortfolioState state;
    std::string stateFile;

public:
    PortfolioManager(std::string file,
                     double risk,
                     double mlThreshold = 0.55,
                     std::string statePath = "portfolio_state.json")
        : logFileName(file),
          riskThreshold(risk),
          mlConfidenceThreshold(mlThreshold),
          mlPredictor("ml_model/predict.py"),
          stateFile(statePath) {
        state = PortfolioState::load(stateFile);
    }

    void addToWatchlist(std::string ticker) {
        watchlist.push_back(ticker);
    }

    void logTrade(std::string ticker, double price, double shares) {
        std::ofstream outFile(logFileName, std::ios::app);
        if (outFile.is_open()) {
            std::time_t t = std::time(nullptr);
            char ts[20];
            std::strftime(ts, sizeof(ts), "%Y-%m-%d", std::localtime(&t));

            outFile << ts << "," << ticker << "," << price << "," << shares << "," << (price * shares) << "\n";
            outFile.close();
        }
    }

    /**
     * Main trading loop: Fetch prices, get ML predictions, execute trades
     */
    void runUpdate() {
        std::cout << "--- Starting Market Update with ML Stock Selection ---" << std::endl;
        std::cout << "ML Model Ready: " << (mlPredictor.isReady() ? "YES" : "NO") << std::endl;
        std::cout << "ML Confidence Threshold: " << std::fixed << std::setprecision(2) << mlConfidenceThreshold << std::endl;
        std::cout << std::endl;

        // Cache prices we’ve seen this run so portfolio value can include multiple holdings
        std::map<std::string, double> priceCache;

        for (const auto& ticker : watchlist) {
            std::cout << "Processing " << ticker << "..." << std::endl;

            auto prediction = mlPredictor.predictForTicker(ticker);

            // Print ML line
            std::cout << "  [ML] " << ticker << ": buy=" << (prediction.buySignal ? "YES" : "NO")
                      << " confidence=" << std::fixed << std::setprecision(2) << prediction.confidence;

            if (prediction.status != "success") {
                std::cout << " [status: " << prediction.status << "]" << std::endl;
                std::this_thread::sleep_for(std::chrono::seconds(2));
                continue;
            }
            std::cout << " ✓ OK" << std::endl;

            // Make sure we have a valid price from Python
            if (!(prediction.latestPrice > 0.0)) {
                std::cerr << "  ERROR: missing/invalid latest_price from Python" << std::endl;
                std::this_thread::sleep_for(std::chrono::seconds(2));
                continue;
            }

            double price = prediction.latestPrice;
            double confidence = prediction.confidence;

            // Update cache
            priceCache[ticker] = price;

            std::cout << "  Price: $" << std::fixed << std::setprecision(2) << price << std::endl;

            // Buy rules
            if (!prediction.buySignal) {
                std::cout << "  → SKIP (ML recommends HOLD/SELL)" << std::endl;
                std::this_thread::sleep_for(std::chrono::seconds(2));
                continue;
            }

            if (confidence < mlConfidenceThreshold) {
                std::cout << "  → SKIP (confidence below threshold " << mlConfidenceThreshold << ")" << std::endl;
                std::this_thread::sleep_for(std::chrono::seconds(2));
                continue;
            }

            // --- Portfolio + buffer setup ---
            const double cashBufferPct = 0.05;
            double minCashToKeep = state.cashUsd * cashBufferPct;
            double spendableCash = state.cashUsd - minCashToKeep;

            if (spendableCash <= 0.0) {
                std::cout << "  → NO SPENDABLE CASH (5% buffer enforced)" << std::endl;
                std::this_thread::sleep_for(std::chrono::seconds(2));
                continue;
            }

            // Calculate current total portfolio value (cash + all holdings we have prices for this run)
            double totalPortfolioValue = state.cashUsd;
            for (const auto& [tkr, sh] : state.shares) {
                auto it = priceCache.find(tkr);
                if (it != priceCache.end()) {
                    totalPortfolioValue += sh * it->second;
                }
            }
            // Include current ticker value if it wasn't already in shares map
            totalPortfolioValue += state.shares[ticker] * price;

            // Allocate proportional to confidence (from spendable only)
            double allocationDollar = spendableCash * confidence;

            // Risk cap enforcement (cap position to riskThreshold of total portfolio)
            double currentValue = state.shares[ticker] * price;
            double maxAllowed = riskThreshold * totalPortfolioValue;
            double roomLeft = std::max(0.0, maxAllowed - currentValue);

            double finalAllocation = std::min(allocationDollar, roomLeft);
            finalAllocation = std::min(finalAllocation, spendableCash);

            if (finalAllocation <= 0.0) {
                std::cout << "  → SKIP (risk cap or buffer limit reached)" << std::endl;
                std::this_thread::sleep_for(std::chrono::seconds(2));
                continue;
            }

            double sharesToBuy = finalAllocation / price;
            double cost = sharesToBuy * price;

            // Final safety: never violate buffer due to rounding
            if (state.cashUsd - cost < minCashToKeep) {
                cost = state.cashUsd - minCashToKeep;
                sharesToBuy = (cost > 0.0) ? (cost / price) : 0.0;
            }

            if (sharesToBuy <= 0.0) {
                std::cout << "  → SKIP (buffer leaves no room)" << std::endl;
                std::this_thread::sleep_for(std::chrono::seconds(2));
                continue;
            }

            std::cout << "  → BUY " << std::fixed << std::setprecision(6)
                      << sharesToBuy << " shares @ $" << std::setprecision(2) << price
                      << " (cost $" << std::setprecision(2) << cost << ")"
                      << std::endl;

            state.shares[ticker] += sharesToBuy;
            state.cashUsd -= cost;

            logTrade(ticker, price, sharesToBuy);

            // Slow down calls
            std::this_thread::sleep_for(std::chrono::seconds(15));
        }

        state.save(stateFile);

        std::cout << "\nUpdated Cash Balance: $"
                  << std::fixed << std::setprecision(2)
                  << state.cashUsd << std::endl;
    }

    void performRiskAudit() {
        std::cout << "\n--- Risk & Diversification Audit ---" << std::endl;

        // If no holdings, nothing to audit
        if (state.shares.empty()) {
            std::cout << "(no holdings in portfolio_state.json)" << std::endl;
            return;
        }

        // Pull fresh prices for each holding (uses your ML python which also returns latest_price)
        std::map<std::string, double> prices;
        for (const auto& [ticker, sh] : state.shares) {
            auto pred = mlPredictor.predictForTicker(ticker);
            if (pred.status == "success" && pred.latestPrice > 0.0) {
                prices[ticker] = pred.latestPrice;
            } else {
                std::cout << ticker << ": price unavailable for audit [status: "
                        << pred.status << "]" << std::endl;
            }
            std::this_thread::sleep_for(std::chrono::seconds(1));
        }

        // Compute total value = cash + sum(position values)
        double holdingsValue = 0.0;
        for (const auto& [ticker, sh] : state.shares) {
            auto it = prices.find(ticker);
            if (it != prices.end()) {
                holdingsValue += sh * it->second;
            }
        }
        double totalPortfolioValue = state.cashUsd + holdingsValue;

        if (totalPortfolioValue <= 0.0) {
            std::cout << "(portfolio value is zero; nothing to audit)" << std::endl;
            return;
        }

        std::cout << "Total Portfolio Value: $" << std::fixed << std::setprecision(2)
                << totalPortfolioValue << std::endl;
        std::cout << "Cash: $" << std::fixed << std::setprecision(2)
                << state.cashUsd << " ("
                << (state.cashUsd / totalPortfolioValue * 100.0) << "%)" << std::endl;

        // Print each position weight
        for (const auto& [ticker, sh] : state.shares) {
            auto it = prices.find(ticker);
            if (it == prices.end()) continue;

            double value = sh * it->second;
            double pct = value / totalPortfolioValue;

            std::cout << ticker << ": $" << std::fixed << std::setprecision(2) << value
                    << " (" << (pct * 100.0) << "%)";
            if (pct > riskThreshold) std::cout << " [!] OVER LIMIT";
            std::cout << std::endl;
        }
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

int main() {
    // Defaults
    double risk = readEnvDouble("RISK_THRESHOLD", 0.25);
    double mlThresh = readEnvDouble("ML_CONFIDENCE_THRESHOLD", 0.55);

    PortfolioManager myIRA("portfolio_log.csv", risk, mlThresh);

    std::vector<std::string> tickers = loadWatchlist("watchlist.txt");
    std::cout << "Loaded " << tickers.size() << " tickers from watchlist." << std::endl;

    for (const auto& ticker : tickers) {
        myIRA.addToWatchlist(ticker);
    }

    myIRA.runUpdate();
    myIRA.performRiskAudit();

    return 0;
}