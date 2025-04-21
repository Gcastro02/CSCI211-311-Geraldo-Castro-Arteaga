#include "pqueue.h"

Pqueue::Pqueue() : head(nullptr), size(0) {}

Pqueue::~Pqueue() {
    while (!empty()) {
        delete dequeue();
    }
}

Cust* Pqueue::dequeue() {
    if (empty()) {
        return nullptr;
    }
    Node* temp = head;
    head = head->next;
    Cust* cust = temp->cust;
    delete temp;
    size--;
    return cust;
}

void Pqueue::enqueue(Cust* cust, int priority) {
    Node* newNode = new Node{cust, priority, nullptr};
    if (empty() || head->priority > priority) {
        newNode->next = head;
        head = newNode;
    } else {
        Node* current = head;
        while (current->next != nullptr && current->next->priority <= priority) {
            current = current->next;
        }
        newNode->next = current->next;
        current->next = newNode;
    }
    size++;
}

bool Pqueue::empty() const {
    return head == nullptr;
}

int Pqueue::length() const {
    return size;
}

int Pqueue::first_priority() const {
    if (empty()) {
        return -1; // or throw an exception
    }
    return head->priority;
}