#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include "cust.h"
#include "pqueue.h"

struct Checker {
    int money = 250; // Each checker starts with $250
    int availableTime = 0; // Time when the checker will be available
    Cust* currentCustomer = nullptr; // Pointer to the current customer being served
};

int run_simulation(const std::string &inputFile, int numCheckers, int breakDuration, const std::string &outputFile) {
    std::ifstream file(inputFile);
    if (!file.is_open()) {
        std::cerr << "Error: could not open input file <" << inputFile << ">." << std::endl;
        return 1; // Return error status
    }

    std::ofstream outFile(outputFile);
    if (!outFile.is_open()) {
        std::cerr << "Error: could not open output file <" << outputFile << ">." << std::endl;
        file.close();
        return 1; // Return error status
    }

    Pqueue arrivalQueue;
    std::string line;

    // Read customers from the input file
    while (std::getline(file, line)) {
        std::istringstream iss(line);
        std::string name, type;
        int arrivalTime, numItems;

        if (!(iss >> name >> type >> arrivalTime >> numItems)) {
            std::cerr << "Error: Invalid input format" << std::endl;
            continue;
        }

        bool isRobber = (type == "robber");
        Cust* customer = new Cust(name, isRobber, arrivalTime, numItems);
        arrivalQueue.enqueue(customer, arrivalTime);
    }
    file.close();

    // Initialize checkers
    Checker* checkers = new Checker[numCheckers]; // Dynamically allocate array of Checkers

    Pqueue shoppingQueue; // Queue for customers currently shopping
    Pqueue checkoutQueue; // Queue for customers waiting to check out

    int clock = 1;
    int numCustomers = arrivalQueue.length();

    while (numCustomers > 0) {
        // Process customers entering the store
        while (!arrivalQueue.empty() && arrivalQueue.first_priority() == clock) {
            Cust* customer = arrivalQueue.dequeue();
            if (customer == nullptr) continue;
            customer->print_entered(outFile, clock);
            int doneShoppingTime = clock + (customer->getNumItems() * 2);
            shoppingQueue.enqueue(customer, doneShoppingTime);
        }

        // Process customers done shopping
        while (!shoppingQueue.empty() && shoppingQueue.first_priority() == clock) {
            Cust* customer = shoppingQueue.dequeue();
            if (customer == nullptr) continue;
            customer->print_done_shopping(outFile, clock);
            checkoutQueue.enqueue(customer, 0); // Priority doesn't matter for checkoutQueue
        }

        // Process customers done checking out
        for (int i = 0; i < numCheckers; ++i) {
            Checker& checker = checkers[i];
            if (checker.currentCustomer && checker.availableTime == clock) {
                Cust* customer = checker.currentCustomer;
                if (customer->isRobber()) {
                    customer->print_stole(outFile, clock, checker.money, i);
                    checker.money = 0; // Robber takes all the money
                    checker.availableTime = clock + breakDuration; // Checker goes on break
                } else {
                    int payment = customer->getNumItems() * 3;
                    customer->print_paid(outFile, clock, payment, i);
                    checker.money += payment;
                }
                delete customer;
                checker.currentCustomer = nullptr;
                --numCustomers;
            }
        }

        // Assign customers to available checkers
        while (!checkoutQueue.empty()) {
            bool assigned = false;
            for (int i = 0; i < numCheckers; ++i) {
                Checker& checker = checkers[i];
                if (!checker.currentCustomer && checker.availableTime <= clock) {
                    Cust* customer = checkoutQueue.dequeue();
                    if (customer == nullptr) break;
                    customer->print_started_checkout(outFile, clock, i);
                    checker.currentCustomer = customer;
                    if (customer->isRobber()) {
                        checker.availableTime = clock + 7; // Robbers take 7 time units
                    } else {
                        checker.availableTime = clock + customer->getNumItems(); // Shoppers take 1 time unit per item
                    }
                    assigned = true;
                    break;
                }
            }
            if (!assigned) break; // No available checkers
        }

        ++clock;
    }

    // Print final register balances and time
    for (int i = 0; i < numCheckers; ++i) {
        outFile << "registers[" << i << "] = $" << checkers[i].money << std::endl;
    }
    outFile << "time = " << clock << std::endl;

    // Cleanup remaining customers in queues
    while (!arrivalQueue.empty()) {
        delete arrivalQueue.dequeue();
    }
    while (!shoppingQueue.empty()) {
        delete shoppingQueue.dequeue();
    }
    while (!checkoutQueue.empty()) {
        delete checkoutQueue.dequeue();
    }

    // Deallocate dynamically allocated array
    delete[] checkers;

    outFile.close();
    return 0; // Return success status
}

int main(int argc, char* argv[]) {
    // Check for invalid number of command line arguments
    if (argc != 5) {
        std::cerr << "Error: invalid number of command line arguments." << std::endl;
        return 1;
    }

    const std::string inputFile = argv[3];
    const std::string outputFile = argv[4];

    // Check if input file can be opened
    std::ifstream file(inputFile);
    if (!file.is_open()) {
        std::cerr << "Error: could not open input file <" << inputFile << ">." << std::endl;
        return 1;
    }
    file.close();

    // Check if output file can be opened
    std::ofstream outFile(outputFile);
    if (!outFile.is_open()) {
        std::cerr << "Error: could not open output file <" << outputFile << ">." << std::endl;
        return 1;
    }
    outFile.close();

    int numCheckers;
    int breakDuration;

    // Validate numCheckers
    try {
        std::string numCheckersStr = argv[1];
        size_t pos;
        numCheckers = std::stoi(numCheckersStr, &pos);
        if (pos != numCheckersStr.length() || numCheckers < 1) {
            throw std::invalid_argument("Invalid number of checkers");
        }
    } catch (const std::invalid_argument&) {
        std::cerr << "Error: invalid number of checkers specified." << std::endl;
        return 1; // Terminate early if invalid
    } catch (const std::out_of_range&) {
        std::cerr << "Error: invalid number of checkers specified." << std::endl;
        return 1; // Terminate early if out of range
    }

    // Validate breakDuration
    try {
        std::string breakDurationStr = argv[2];
        size_t pos;
        breakDuration = std::stoi(breakDurationStr, &pos);
        if (pos != breakDurationStr.length() || breakDuration < 0) {
            throw std::invalid_argument("Invalid break duration");
        }
    } catch (const std::invalid_argument&) {
        std::cerr << "Error: invalid checker break duration specified." << std::endl;
        return 1; // Terminate early if invalid
    } catch (const std::out_of_range&) {
        std::cerr << "Error: invalid checker break duration specified." << std::endl;
        return 1; // Terminate early if out of range
    }

    return run_simulation(inputFile, numCheckers, breakDuration, outputFile);
}