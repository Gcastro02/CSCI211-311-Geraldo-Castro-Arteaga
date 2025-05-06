#ifndef MONTHLY_DATA_H
#define MONTHLY_DATA_H

#include <string>
#include <iostream>
#include <iomanip> // For std::setw, std::fixed, std::setprecision

// Represents the economic data for a single month
struct MonthlyData {
    std::string date;        // Date in "YYYY-MM-DD" format
    double unemploymentRate; // Unemployment rate percentage
    double cpi;              // Consumer Price Index

    // Default constructor
    MonthlyData() : unemploymentRate(0.0), cpi(0.0) {}

    // Parameterized constructor
    MonthlyData(std::string dt, double ur, double cp)
        : date(dt), unemploymentRate(ur), cpi(cp) {}

    // Overload the output stream operator for easy printing
    friend std::ostream& operator<<(std::ostream& os, const MonthlyData& data) {
        os << "Date: " << data.date
           << ", Unemployment Rate: " << std::fixed << std::setprecision(2) << data.unemploymentRate << "%"
           << ", CPI: " << std::fixed << std::setprecision(4) << data.cpi;
        return os;
    }
};

#endif // MONTHLY_DATA_H
