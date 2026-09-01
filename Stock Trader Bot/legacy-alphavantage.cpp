/**
 * Superseded reference implementation — kept for comparison only.
 *
 * This was the first version of the bot: fetch a quote from Alpha Vantage, log a
 * simulated one-share buy regardless of any signal, then audit concentration
 * using cost basis read back from the CSV. trader.cpp replaces it and is what
 * you should run — it uses a model for entry decisions, values positions at
 * market rather than cost, sizes against a risk budget, and can exit.
 *
 * Requires libcurl. Build with `make legacy`.
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
#include <cstdlib>
#include <curl/curl.h>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

// Callback for CURL to handle the incoming data stream
size_t WriteCallback(void* contents, size_t size, size_t nmemb, std::string* s) {
    size_t newLength = size * nmemb;
    s->append((char*)contents, newLength);
    return newLength;
}

class PortfolioManager {
private:
    std::string logFileName;
    double riskThreshold;
    std::vector<std::string> watchlist;
    std::string apiKey;

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
    PortfolioManager(std::string file, double risk, std::string key) 
        : logFileName(file), riskThreshold(risk), apiKey(key) {}

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

    void runUpdate() {
        std::cout << "--- Starting Market Update ---" << std::endl;
        for (const auto& ticker : watchlist) {
            std::string rawData = fetchData(ticker);
            try {
                auto data = json::parse(rawData);
                std::string priceStr = data["Global Quote"]["05. price"];
                double price = std::stod(priceStr);

                std::cout << "Ticker: " << ticker << " | Price: $" << std::fixed << std::setprecision(2) << price << std::endl;

                // Simple logic: If it's a "demo" run, we'll log a simulated buy of 1 share
                logTrade(ticker, price, 1);

            } catch (...) {
                std::cerr << "Error fetching " << ticker << " (Check API limit)" << std::endl;
            }
            // Wait 15s to stay under free tier limit (5 requests/min)
            std::this_thread::sleep_for(std::chrono::seconds(15));
        }
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
    // Read the key from the environment. An earlier version of this file had a
    // key committed inline, which put it in the repository's history — if you
    // are reading this, that key should be treated as compromised and rotated.
    const char* apiKey = std::getenv("ALPHAVANTAGE_API_KEY");
    if (!apiKey || !*apiKey) {
        std::cerr << "Error: ALPHAVANTAGE_API_KEY is not set.\n"
                  << "Get a free key at https://www.alphavantage.co/ then:\n"
                  << "  export ALPHAVANTAGE_API_KEY=your_key_here\n";
        return 1;
    }

    PortfolioManager portfolio("portfolio_log.csv", 0.25, apiKey);

    portfolio.addToWatchlist("VOO");
    portfolio.addToWatchlist("AAPL");
    portfolio.addToWatchlist("MSFT");

    portfolio.runUpdate();
    portfolio.performRiskAudit();

    return 0;
}