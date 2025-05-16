#ifndef DATA_LIST_H
#define DATA_LIST_H

#include "MonthlyData.h"
#include <vector> // Needed for returning data for calculation
#include <string> // Needed for exception messages
#include <optional> // To handle cases where the list might be empty for min/max

// Forward declaration of the Node struct
struct Node;

// Abstract Data Type (ADT) implemented as a Linked List
// Stores MonthlyData objects
class DataList {
private:
    // Node structure for the linked list
    struct Node {
        MonthlyData data; // Data payload for the node
        Node* next;       // Pointer to the next node in the list

        // Node constructor
        Node(const MonthlyData& d) : data(d), next(nullptr) {}
    };

    Node* head; // Pointer to the first node in the list
    int count;  // Number of nodes in the list

public:
    // Constructor
    DataList();

    // Destructor (handles memory deallocation)
    ~DataList();

    // Adds a new MonthlyData entry to the end of the list
    void add(const MonthlyData& data);

    // Prints all entries in the list to the console
    void print() const;

    // Returns the number of entries in the list
    int getSize() const;

    // Checks if the list is empty
    bool isEmpty() const;

    // Retrieves all unemployment rates from the list
    std::vector<double> getUnemploymentRates() const;

    // Retrieves all CPI values from the list
    std::vector<double> getCPIs() const;

    // --- New Methods for Min/Max Analysis ---
    // Finds the data point with the highest unemployment rate
    // Returns std::nullopt if the list is empty
    std::optional<MonthlyData> findMaxUnemployment() const;

    // Finds the data point with the lowest unemployment rate
    // Returns std::nullopt if the list is empty
    std::optional<MonthlyData> findMinUnemployment() const;

    // Finds the data point with the highest CPI
    // Returns std::nullopt if the list is empty
    std::optional<MonthlyData> findMaxCPI() const;

    // Finds the data point with the lowest CPI
    // Returns std::nullopt if the list is empty
    std::optional<MonthlyData> findMinCPI() const;


    // --- Algorithm for Analysis ---
    // Calculates the Pearson correlation coefficient between
    // unemployment rates and CPIs stored in the list.
    double calculateCorrelation() const;
};

#endif // DATA_LIST_H
