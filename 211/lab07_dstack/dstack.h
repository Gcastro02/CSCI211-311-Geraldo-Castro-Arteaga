#ifndef DSTACK_H
#define DSTACK_H

class Dstack
{
public:
    Dstack();
    ~Dstack();
    void push(double value);
    bool pop(double &value);
    int size() const;

private:
    struct Node
    {
        double data;
        Node *next;
    };
    Node *top;
    int count;
};

#endif