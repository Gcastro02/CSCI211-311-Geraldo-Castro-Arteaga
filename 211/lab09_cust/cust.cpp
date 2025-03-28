#include "cust.h"

Cust::Cust(const std::string &name, bool isRobber, int arrivalTime, int numItems)
    : name(name), isRobber(isRobber), arrivalTime(arrivalTime), numItems(numItems) {}

void Cust::print(std::ostream &os) const {
    os << name << " " << (isRobber ? "robber" : "shopper") << " " << arrivalTime << " " << numItems << std::endl;
}