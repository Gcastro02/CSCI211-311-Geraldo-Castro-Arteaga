#include "DataList.h"
#include <iostream>
#include <vector>
#include <numeric> // For std::accumulate
#include <cmath>   // For std::sqrt, std::pow
#include <stdexcept> // For std::runtime_error
#include <iomanip> // For std::fixed, std::setprecision
#include <limits>  // For numeric limits (optional, can compare with first node)
#include <optional> // For return type of min/max functions

// Constructor: Initializes an empty list
DataList::DataList() : head(nullptr), count(0) {}

// Destructor: Deallocates all nodes in the list
DataList::~DataList() {
    Node* current = head;
    while (current != nullptr) {
        Node* next = current->next; // Store pointer to next node
        delete current;             // Delete the current node
        current = next;             // Move to the next node
    }
    head = nullptr; // Ensure head is null after deletion
    count = 0;
}

// Adds a new MonthlyData entry to the end of the list
void DataList::add(const MonthlyData& data) {
    Node* newNode = new Node(data); // Allocate memory for the new node

    if (head == nullptr) {
        // If the list is empty, the new node becomes the head
        head = newNode;
    } else {
        // Otherwise, traverse to the end of the list
        Node* current = head;
        while (current->next != nullptr) {
            current = current->next;
        }
        // Append the new node at the end
        current->next = newNode;
    }
    count++; // Increment the node count
}

// Prints all entries in the list to the console
void DataList::print() const {
    if (isEmpty()) {
        std::cout << "Data list is empty." << std::endl;
        return;
    }

    std::cout << "--- Monthly Economic Data ---" << std::endl;
    Node* current = head;
    int index = 1;
    while (current != nullptr) {
        std::cout << std::setw(4) << index++ << ": " << current->data << std::endl;
        current = current->next;
    }
    std::cout << "-----------------------------" << std::endl;
    std::cout << "Total entries: " << count << std::endl;
    std::cout << "-----------------------------" << std::endl;
}

// Returns the number of entries in the list
int DataList::getSize() const {
    return count;
}

// Checks if the list is empty
bool DataList::isEmpty() const {
    return head == nullptr; // Or return count == 0;
}

// Retrieves all unemployment rates from the list
std::vector<double> DataList::getUnemploymentRates() const {
    std::vector<double> rates;
    rates.reserve(count); // Reserve space for efficiency
    Node* current = head;
    while (current != nullptr) {
        rates.push_back(current->data.unemploymentRate);
        current = current->next;
    }
    return rates;
}

// Retrieves all CPI values from the list
std::vector<double> DataList::getCPIs() const {
    std::vector<double> cpis;
    cpis.reserve(count); // Reserve space for efficiency
    Node* current = head;
    while (current != nullptr) {
        cpis.push_back(current->data.cpi);
        current = current->next;
    }
    return cpis;
}

// --- New Min/Max Implementations ---

// Finds the data point with the highest unemployment rate
std::optional<MonthlyData> DataList::findMaxUnemployment() const {
    if (isEmpty()) {
        return std::nullopt; // Return empty optional if list is empty
    }

    Node* maxNode = head;    // Assume first node is max initially
    Node* current = head->next; // Start comparing from the second node

    while (current != nullptr) {
        if (current->data.unemploymentRate > maxNode->data.unemploymentRate) {
            maxNode = current; // Found a new maximum
        }
        current = current->next;
    }
    return maxNode->data; // Return the data of the node with the max value
}

// Finds the data point with the lowest unemployment rate
std::optional<MonthlyData> DataList::findMinUnemployment() const {
    if (isEmpty()) {
        return std::nullopt;
    }

    Node* minNode = head;    // Assume first node is min initially
    Node* current = head->next;

    while (current != nullptr) {
        if (current->data.unemploymentRate < minNode->data.unemploymentRate) {
            minNode = current; // Found a new minimum
        }
        current = current->next;
    }
    return minNode->data;
}

// Finds the data point with the highest CPI
std::optional<MonthlyData> DataList::findMaxCPI() const {
     if (isEmpty()) {
        return std::nullopt;
    }

    Node* maxNode = head;
    Node* current = head->next;

    while (current != nullptr) {
        if (current->data.cpi > maxNode->data.cpi) {
            maxNode = current;
        }
        current = current->next;
    }
    return maxNode->data;
}

// Finds the data point with the lowest CPI
std::optional<MonthlyData> DataList::findMinCPI() const {
     if (isEmpty()) {
        return std::nullopt;
    }

    Node* minNode = head;
    Node* current = head->next;

    while (current != nullptr) {
        if (current->data.cpi < minNode->data.cpi) {
            minNode = current;
        }
        current = current->next;
    }
    return minNode->data;
}


// --- Algorithm for Analysis ---
// Calculates the Pearson correlation coefficient between
// unemployment rates and CPIs stored in the list.
double DataList::calculateCorrelation() const {
    if (count < 2) {
        // Correlation requires at least two data points
        throw std::runtime_error("Correlation calculation requires at least two data points.");
    }

    std::vector<double> x = getUnemploymentRates(); // Unemployment Rates
    std::vector<double> y = getCPIs();              // CPIs

    // Calculate means
    double sum_x = std::accumulate(x.begin(), x.end(), 0.0);
    double sum_y = std::accumulate(y.begin(), y.end(), 0.0);
    double mean_x = sum_x / count;
    double mean_y = sum_y / count;

    // Calculate standard deviations and covariance
    double sq_sum_dev_x = 0.0; // Sum of squared deviations for x
    double sq_sum_dev_y = 0.0; // Sum of squared deviations for y
    double sum_cov = 0.0;      // Sum for covariance calculation

    for (int i = 0; i < count; ++i) {
        double dev_x = x[i] - mean_x;
        double dev_y = y[i] - mean_y;
        sq_sum_dev_x += std::pow(dev_x, 2);
        sq_sum_dev_y += std::pow(dev_y, 2);
        sum_cov += dev_x * dev_y;
    }

    // Handle cases where standard deviation might be zero (all values are the same)
    if (sq_sum_dev_x == 0 || sq_sum_dev_y == 0) {
         // If either variable has zero variance, correlation is undefined or zero
         // depending on convention. Returning 0 is a common approach.
        return 0.0;
    }

    // Using population standard deviation (divide by N)
    double stddev_x = std::sqrt(sq_sum_dev_x / count);
    double stddev_y = std::sqrt(sq_sum_dev_y / count);
    double covariance = sum_cov / count; // Population covariance

    // Calculate Pearson correlation coefficient
    // Formula: correlation = covariance(X, Y) / (stddev(X) * stddev(Y))
    // Check for division by zero just in case (though handled above)
    if (stddev_x == 0 || stddev_y == 0) {
        return 0.0; // Or handle as undefined, but previous check should catch this
    }
    double correlation = covariance / (stddev_x * stddev_y);


    // Clamp correlation to [-1, 1] due to potential floating point inaccuracies
    if (correlation > 1.0) correlation = 1.0;
    if (correlation < -1.0) correlation = -1.0;


    return correlation;
}
