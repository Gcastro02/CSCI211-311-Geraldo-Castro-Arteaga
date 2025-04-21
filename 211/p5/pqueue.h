#ifndef PQUEUE_H
#define PQUEUE_H

#include "cust.h"

class Pqueue {
public:
    Pqueue();
    ~Pqueue();
    Cust* dequeue();
    void enqueue(Cust* cust, int priority);
    bool empty() const;
    int length() const;
    int first_priority() const;

private:
    struct Node {
        Cust* cust;
        int priority;
        Node* next;
    };
    Node* head;
    int size;
};

#endif // PQUEUE_H