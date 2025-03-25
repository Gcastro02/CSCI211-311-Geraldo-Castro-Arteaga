#include "dstack.h"
#include <iostream>

Dstack::Dstack() : top(nullptr), count(0) {}

Dstack::~Dstack()
{
    while (top != nullptr)
    {
        Node *temp = top;
        top = top->next;
        delete temp;
    }
}

void Dstack::push(double value)
{
    Node *newNode = new Node;
    newNode->data = value;
    newNode->next = top;
    top = newNode;
    count++;
}

bool Dstack::pop(double &value)
{
    if (top == nullptr)
    {
        return false;
    }
    Node *temp = top;
    value = top->data;
    top = top->next;
    delete temp;
    count--;
    return true;
}

int Dstack::size() const
{
    return count;
}

bool Dstack::empty() const
{
    return top == nullptr;
}