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
        result.buySignal = false;
        result.confidence = 0.0;
        result.probability = 0.0;
        result.status = "model_not_ready";

        if (!modelReady) {
            return result;
        }

        try {
            // Execute: python3 ml_model/predict.py TICKER
            // Use python3 directly; it should find virtualenv in PATH or use system python
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

            // Parse JSON result
            auto predictions = json::parse(output);
            
            result.ticker = predictions["ticker"];
            result.buySignal = predictions["buy_signal"];
            result.confidence = predictions["confidence"];
            result.probability = predictions["probability"];
            result.status = predictions["status"];
            
            if (predictions.contains("latest_price")) {
                result.latestPrice = predictions["latest_price"];
            }
            if (predictions.contains("volatility")) {
                result.volatility = predictions["volatility"];
            }

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
        json j; f >> j;

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
    double mlConfidenceThreshold;  // Only buy if ML confidence > this
    std::vector<std::string> watchlist;
    MLPredictor mlPredictor;

    PortfolioState state;
    std::string stateFile;

public:
    PortfolioManager(std::string file, double risk,
                     double mlThreshold = 0.55,
                     std::string statePath = "portfolio_state.json")
        : logFileName(file),
          riskThreshold(risk),
          mlConfidenceThreshold(mlThreshold),
          mlPredictor("ml_model/predict.py"),
          stateFile(statePath)
    {
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
     * Evaluate whether to buy a stock using ML prediction + risk management
     */
    bool shouldBuy(const std::string& ticker, double& confidenceOut) {
        // Get ML prediction
        auto prediction = mlPredictor.predictForTicker(ticker);
        confidenceOut = prediction.confidence;

        // Log ML prediction results
        std::cout << "  [ML] " << ticker << ": buy=" << (prediction.buySignal ? "YES" : "NO")
                  << " confidence=" << std::fixed << std::setprecision(2) << prediction.confidence;

        if (prediction.status != "success") {
            std::cout << " [status: " << prediction.status << "]" << std::endl;
            return false;
        }

        // Decision logic:
        // 1. ML model must recommend buy
        // 2. Confidence must exceed threshold
        if (!prediction.buySignal) {
            std::cout << " [ML recommends HOLD/SELL]" << std::endl;
            return false;
        }

        if (prediction.confidence < mlConfidenceThreshold) {
            std::cout << " [confidence below threshold " << mlConfidenceThreshold << "]" << std::endl;
            return false;
        }

        std::cout << " ✓ APPROVED" << std::endl;
        return true;
    }

    /**
     * Main trading loop: Fetch prices, get ML predictions, execute trades
     */
    void runUpdate() {
        std::cout << "--- Starting Market Update with ML Stock Selection ---" << std::endl;
        std::cout << "ML Model Ready: " << (mlPredictor.isReady() ? "YES" : "NO") << std::endl;
        std::cout << std::endl;

        for (const auto& ticker : watchlist) {
            std::cout << "Processing " << ticker << "..." << std::endl;

            auto prediction = mlPredictor.predictForTicker(ticker);

            // Print ML line similar to your shouldBuy()
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

            std::cout << "  Price: $" << std::fixed << std::setprecision(2) << price << std::endl;

            // Apply your buy rules (same logic as shouldBuy, but using the prediction we already have)
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

            // Calculate current total portfolio value (cash + this ticker holdings value)
            double totalPortfolioValue = state.cashUsd + (state.shares[ticker] * price);

            // Allocate proportional to confidence (from spendable only)
            double allocationDollar = spendableCash * confidence;

            // Risk cap enforcement
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
                sharesToBuy = cost / price;
            }

            if (sharesToBuy <= 0.0) {
                std::cout << "  → SKIP (buffer leaves no room)" << std::endl;
                std::this_thread::sleep_for(std::chrono::seconds(2));
                continue;
            }

            std::cout << "  → BUY " << std::fixed << std::setprecision(4)
                    << sharesToBuy << " shares @ $" << price << std::endl;

            state.shares[ticker] += sharesToBuy;
            state.cashUsd -= cost;

            logTrade(ticker, price, sharesToBuy);

            // Short sleep so yfinance isn't hammered (much lower risk than AlphaVantage limits)
            std::this_thread::sleep_for(std::chrono::seconds(2));

            // Wait 15s to stay under free tier limit (5 requests/min)
            std::this_thread::sleep_for(std::chrono::seconds(15));
        }

        state.save(stateFile);

        std::cout 
            << "\nUpdated Cash Balance: $" 
            << std::fixed << std::setprecision(2)
            << state.cashUsd << std::endl;
    }

    /**
     * Calculate number of shares to buy based on position sizing
     * For now: simple fixed position size (1 share) or risk-based allocation
     */
    int calculateSharesAllocation(const std::string& ticker, double price) {
        // TODO: Implement dynamic position sizing based on:
        // - Portfolio total value
        // - Risk per trade
        // - Volatility from ML model
        return 1;  // Default: 1 share per trade
    }

    void performRiskAudit() {
        std::ifstream inFile(logFileName);
        std::string line;
        std::map<std::string, double> holdings;
        double totalValue = 0.0;

        while (std::getline(inFile, line)) {
            std::stringstream ss(line);
            std::string date, ticker, p, s, total;
            std::getline(ss, date, ','); std::getline(ss, ticker, ',');
            std::getline(ss, p, ',');    std::getline(ss, s, ',');
            std::getline(ss, total, ',');

            if (!total.empty()) {
                double cost = std::stod(total);
                holdings[ticker] += cost;
                totalValue += cost;
            }
        }

        std::cout << "\n--- Risk & Diversification Audit ---" << std::endl;
        for (auto const& [ticker, val] : holdings) {
            double percent = val / totalValue;
            std::cout << ticker << ": " << (percent * 100) << "%";
            if (percent > riskThreshold) std::cout << " [!] OVER LIMIT";
            std::cout << std::endl;
        }
    }
};

int main() {
    PortfolioManager myIRA("portfolio_log.csv", 0.25, 0.65);

    std::vector<std::string> tickers = loadWatchlist("watchlist.txt");
    std::cout << "Loaded " << tickers.size() << " tickers from watchlist." << std::endl;

    for (const auto& ticker : tickers) {
        myIRA.addToWatchlist(ticker);
    }

    myIRA.runUpdate();
    myIRA.performRiskAudit();

    return 0;
}
