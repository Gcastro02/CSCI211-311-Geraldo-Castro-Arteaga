#ifndef CUST_H
#define CUST_H

#include <string>
#include <iostream>

class Cust {
public:
    Cust(const std::string &name, bool isRobber, int arrivalTime, int numItems);
    void print(std::ostream &os) const;

private:
    std::string name;
    bool isRobber;
    int arrivalTime;
    int numItems;
};

#endif // CUST_H