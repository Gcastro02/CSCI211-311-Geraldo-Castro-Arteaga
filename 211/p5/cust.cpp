#include "cust.h"

Cust::Cust(const std::string &name, bool robberFlag, int arrivalTime, int numItems)
    : name(name), Robber(robberFlag), arrivalTime(arrivalTime), numItems(numItems) {}

void Cust::print(std::ostream &os) const {
    os << name << " " << (Robber ? "robber" : "shopper") << " " << arrivalTime << " " << numItems << std::endl;
}

void Cust::print_entered(std::ostream &os, int clock) const {
    assert(clock == arrivalTime);
    os << clock << ": " << name << " entered store" << std::endl;
}

void Cust::print_done_shopping(std::ostream &os, int clock) const {
    os << clock << ": " << name << " done shopping" << std::endl;
}

void Cust::print_started_checkout(std::ostream &os, int clock, int checkerID) const {
    os << clock << ": " << name << " started checkout with checker " << checkerID << std::endl;
}

void Cust::print_paid(std::ostream &os, int clock, int amount, int checkerID) const {
    os << clock << ": " << name << " paid $" << amount << " for " << numItems
       << (numItems == 1 ? " item" : " items") << " to checker " << checkerID << std::endl;
}

void Cust::print_stole(std::ostream &os, int clock, int amount, int checkerID) const {
    os << clock << ": " << name << " stole $" << amount << " and " << numItems
       << (numItems == 1 ? " item" : " items") << " from checker " << checkerID << std::endl;
}

std::string Cust::getName() const {
    return name;
}

bool Cust::isRobber() const {
    return Robber;
}

int Cust::getNumItems() const {
    return numItems;
}

int Cust::getArrivalTime() const {
    return arrivalTime;
}