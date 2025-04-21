#ifndef CUST_H
#define CUST_H

#include <string>
#include <iostream>
#include <cassert>

class Cust {
public:
    Cust(const std::string &name, bool isRobber, int arrivalTime, int numItems);

    void print(std::ostream &os) const;
    void print_entered(std::ostream &os, int clock) const;
    void print_done_shopping(std::ostream &os, int clock) const;
    void print_started_checkout(std::ostream &os, int clock, int checkerID) const;
    void print_paid(std::ostream &os, int clock, int amount, int checkerID) const;
    void print_stole(std::ostream &os, int clock, int amount, int checkerID) const;

    std::string getName() const;
    bool isRobber() const;
    int getNumItems() const;
    int getArrivalTime() const;

private:
    std::string name;
    bool Robber;
    int arrivalTime;
    int numItems;
};

#endif // CUST_H