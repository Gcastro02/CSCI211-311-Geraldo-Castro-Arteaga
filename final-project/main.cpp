#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <map>
#include <stdexcept> // For exception handling
#include <iomanip>   // For output formatting
#include <optional>  // For handling results from min/max functions

#include "MonthlyData.h"
#include "DataList.h"

// Function to read data from a CSV file and store it in a map (Date -> Value)
std::map<std::string, double> readCsvData(const std::string& filename, const std::string& valueName) {
    std::map<std::string, double> dataMap;
    std::ifstream file(filename);
    std::string line;

    if (!file.is_open()) {
        throw std::runtime_error("Error: Could not open file " + filename);
    }

    // Read and discard the header line
    if (!std::getline(file, line)) {
         throw std::runtime_error("Error: Could not read header from file " + filename);
    }

    int lineNum = 1; // Start after header
    while (std::getline(file, line)) {
        lineNum++;
        std::stringstream ss(line);
        std::string segment;
        std::vector<std::string> segments;

        // Split the line by comma
        while (std::getline(ss, segment, ',')) {
            segments.push_back(segment);
        }

        // Expecting two columns: DATE, VALUE
        if (segments.size() == 2) {
            std::string dateStr = segments[0];
            std::string valueStr = segments[1];

            // Skip entries where value is "." or empty
             if (valueStr == "." || valueStr.empty()) {
                continue;
            }

            try {
                // Attempt to convert value string to double
                double value = std::stod(valueStr);
                dataMap[dateStr] = value; // Add to map, keyed by date
            } catch (const std::invalid_argument& e) {
                std::cerr << "Warning: Invalid number format on line " << lineNum << " in " << filename << ": '" << valueStr << "'. Skipping." << std::endl;
            } catch (const std::out_of_range& e) {
                std::cerr << "Warning: Number out of range on line " << lineNum << " in " << filename << ": '" << valueStr << "'. Skipping." << std::endl;
            }
        } else {
             // Handle lines that don't have exactly two columns (e.g., empty lines)
             if (!line.empty()) { // Only warn if the line wasn't just blank
                std::cerr << "Warning: Skipping malformed line " << lineNum << " in " << filename << ". Expected 2 columns, found " << segments.size() << "." << std::endl;
             }
        }
    }

    file.close();
    std::cout << "Successfully read " << dataMap.size() << " valid entries from " << filename << std::endl;
    return dataMap;
}

// Helper function to print optional MonthlyData results
void printDataPoint(const std::string& label, const std::optional<MonthlyData>& dataOpt, const std::string& valueLabel, const std::string& unit, int precision) {
    std::cout << label << ": ";
    if (dataOpt) {
        const MonthlyData& data = *dataOpt; // Get the value from optional
        std::cout << std::fixed << std::setprecision(precision) << (valueLabel == "Unemployment" ? data.unemploymentRate : data.cpi)
                  << unit << " (on " << data.date << ")" << std::endl;
    } else {
        std::cout << "N/A (list was empty)" << std::endl;
    }
}

int main() {
    // --- Configuration ---
    const std::string unemploymentFile = "UNRATE.csv";
    const std::string cpiFile = "CORESTICKM159SFRBATL.csv";

    try {
        // --- Data Loading ---
        std::cout << "Reading data files..." << std::endl;
        std::map<std::string, double> unemploymentData = readCsvData(unemploymentFile, "Unemployment Rate");
        std::map<std::string, double> cpiData = readCsvData(cpiFile, "CPI");
        std::cout << "Data reading complete." << std::endl << std::endl;

        // --- Data Merging and ADT Population ---
        DataList economicDataList; // Create custom linked list ADT instance

        std::cout << "Merging data and populating DataList..." << std::endl;
        int commonEntries = 0;
        std::string firstDate = "";
        std::string lastDate = "";
        // Iterate through unemployment data, check if date exists in CPI data
        // Using std::map ensures dates are processed in chronological order
        for (const auto& pair : unemploymentData) {
            const std::string& date = pair.first;
            double unemploymentRate = pair.second;

            // Find the corresponding CPI data for the same date
            auto cpiIt = cpiData.find(date);
            if (cpiIt != cpiData.end()) {
                // If date exists in both datasets, create MonthlyData and add to list
                double cpiValue = cpiIt->second;
                economicDataList.add(MonthlyData(date, unemploymentRate, cpiValue));
                commonEntries++;
                if (firstDate.empty()) {
                    firstDate = date; // Capture the first date with common data
                }
                lastDate = date; // Update the last date with common data
            }
            // Dates only present in one file are implicitly skipped
        }
        std::cout << "Finished populating DataList with " << commonEntries << " common monthly entries." << std::endl;
         if (commonEntries > 0) {
             std::cout << "Data ranges from " << firstDate << " to " << lastDate << "." << std::endl;
         }
         std::cout << std::endl;

        // --- Min/Max Analysis (New Section) ---
        std::cout << "--- Data Extremes Analysis ---" << std::endl;
        if (economicDataList.isEmpty()) {
             std::cout << "No common data found, skipping extremes analysis." << std::endl;
        } else {
            // Find and print min/max unemployment
            auto maxUnempOpt = economicDataList.findMaxUnemployment();
            auto minUnempOpt = economicDataList.findMinUnemployment();
            printDataPoint("  Highest Unemployment Rate", maxUnempOpt, "Unemployment", "%", 2);
            printDataPoint("  Lowest Unemployment Rate ", minUnempOpt, "Unemployment", "%", 2);

            // Find and print min/max CPI
            auto maxCpiOpt = economicDataList.findMaxCPI();
            auto minCpiOpt = economicDataList.findMinCPI();
            printDataPoint("  Highest CPI              ", maxCpiOpt, "CPI", "", 4); // Assuming CPI doesn't have a unit like %
            printDataPoint("  Lowest CPI               ", minCpiOpt, "CPI", "", 4);
        }
        std::cout << "----------------------------" << std::endl << std::endl;

        // --- Correlation Analysis ---
        if (economicDataList.getSize() < 2) {
             std::cerr << "Warning: Not enough common data points (" << economicDataList.getSize()
                       << ") to perform correlation analysis. Need at least 2." << std::endl << std::endl;
             // Don't exit, just skip correlation
        } else {
            std::cout << "--- Correlation Analysis ---" << std::endl;
            std::cout << "Calculating Pearson correlation coefficient between Unemployment Rate and CPI..." << std::endl;

            try {
                double correlation = economicDataList.calculateCorrelation();

                // --- Results ---
                std::cout << std::fixed << std::setprecision(4); // Format output
                std::cout << "\nAnalysis Period: Data from " << economicDataList.getSize() << " common months (" << firstDate << " to " << lastDate << ")." << std::endl;
                std::cout << "Pearson Correlation Coefficient: " << correlation << std::endl;

                // Interpretation of the result
                std::cout << "\nInterpretation:" << std::endl;
                if (correlation > 0.7) {
                    std::cout << "  There appears to be a strong positive linear correlation." << std::endl;
                } else if (correlation > 0.3) {
                    std::cout << "  There appears to be a moderate positive linear correlation." << std::endl;
                } else if (correlation > -0.3) {
                    std::cout << "  There appears to be a weak or negligible linear correlation." << std::endl;
                } else if (correlation > -0.7) {
                    std::cout << "  There appears to be a moderate negative linear correlation." << std::endl;
                } else {
                    std::cout << "  There appears to be a strong negative linear correlation." << std::endl;
                }
                std::cout << "  (Note: Correlation measures linear association. Other relationships might exist.)" << std::endl;

            } catch (const std::exception& e) {
                 std::cerr << "Error during correlation calculation: " << e.what() << std::endl;
            }
             std::cout << "----------------------------" << std::endl;
        }

    } catch (const std::exception& e) {
        // Catch potential errors (file not found, calculation errors)
        std::cerr << "An error occurred: " << e.what() << std::endl;
        return 1;
    }

    return 0;
}
