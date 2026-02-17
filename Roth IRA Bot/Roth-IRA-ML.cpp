#include <iostream>
#include <vector>
#include <string>
#include <fstream>
#include <iomanip>
#include <map>
#include <sstream>
#include <thread>
#include <chrono>
#include <curl/curl.h>
#include <nlohmann/json.hpp>
#include <cstdlib>
#include <cstdio>
#include <memory>

using json = nlohmann::json;

// Callback for CURL to handle the incoming data stream
size_t WriteCallback(void* contents, size_t size, size_t nmemb, std::string* s) {
    size_t newLength = size * nmemb;
    s->append((char*)contents, newLength);
    return newLength;
}

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
            std::string cmd = "cd ml_model && python3 predict.py " + ticker + " 2>/dev/null";
            
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

class PortfolioManager {
private:
    std::string logFileName;
    double riskThreshold;
    double mlConfidenceThreshold;  // Only buy if ML confidence > this
    std::vector<std::string> watchlist;
    std::string apiKey;
    MLPredictor mlPredictor;

    // Internal helper to fetch data via CURL
    std::string fetchData(std::string ticker) {
        CURL* curl;
        std::string readBuffer;
        std::string url = "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=" + ticker + "&apikey=" + apiKey;

        curl = curl_easy_init();
        if (curl) {
            curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
            curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
            curl_easy_setopt(curl, CURLOPT_WRITEDATA, &readBuffer);
            curl_easy_perform(curl);
            curl_easy_cleanup(curl);
        }
        return readBuffer;
    }

public:
    PortfolioManager(std::string file, double risk, std::string key, double mlThreshold = 0.65) 
        : logFileName(file), riskThreshold(risk), mlConfidenceThreshold(mlThreshold), apiKey(key),
          mlPredictor("ml_model/predict.py") {}

    void addToWatchlist(std::string ticker) {
        watchlist.push_back(ticker);
    }

    void logTrade(std::string ticker, double price, int shares) {
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

            // Fetch current price from API
            std::string rawData = fetchData(ticker);
            try {
                auto data = json::parse(rawData);
                std::string priceStr = data["Global Quote"]["05. price"];
                double price = std::stod(priceStr);

                std::cout << "  Price: $" << std::fixed << std::setprecision(2) << price << std::endl;

                // Get ML prediction for this stock
                double confidence = 0.0;
                if (shouldBuy(ticker, confidence)) {
                    // ML approved: Calculate shares to buy
                    int shares = calculateSharesAllocation(ticker, price);
                    std::cout << "  → BUY " << shares << " shares @ $" << std::fixed 
                              << std::setprecision(2) << price << std::endl;
                    logTrade(ticker, price, shares);
                } else {
                    std::cout << "  → SKIP (ML rejection)" << std::endl;
                }

            } catch (const std::exception& e) {
                std::cerr << "  ERROR fetching " << ticker << ": " << e.what() << std::endl;
            }

            // Wait 15s to stay under free tier limit (5 requests/min)
            std::this_thread::sleep_for(std::chrono::seconds(15));
        }
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
    // Configuration
    const char* apiKey = std::getenv("ALPHAVANTAGE_API_KEY");
    if (!apiKey) {
        apiKey = "OWJMTJTHU3LCRV1F";  // Fallback to hardcoded (NOT SECURE - use env var on Pi)
    }

    // Initialize portfolio manager with ML integration
    // Parameters: logFile, riskThreshold, apiKey, mlConfidenceThreshold
    PortfolioManager myIRA("portfolio_log.csv", 0.25, apiKey, 0.65);

    // Add stocks to watchlist
    std::vector<std::string> tickers = loadWatchlist("watchlist.txt");

    std::cout << "Loaded" << tickers.size() << " tickers from watchlist." << std::endl;

    // Run market update (with ML predictions)
    myIRA.runUpdate();

    // Analyze risk after trades
    myIRA.performRiskAudit();

    return 0;
}
