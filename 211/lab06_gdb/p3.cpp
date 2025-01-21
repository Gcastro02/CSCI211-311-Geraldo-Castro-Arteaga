#include <iostream>
using namespace std;

// Normally the class declaration (class Set) is put into a 
// separate file (set.h) from the class implementation (functions, set.cpp)
// Everything is in one file so it is easier to learn about gdb/ddd

// This example is more complicated than it needs to be.  I've set it up
// this way to challenge you to figure out exactly how it works -- you have
// to understand exactly how it works to find the problem.

// A class to hold a set of integers
class Set
{
    public:
        void insert(int i);
        void print();
        Set(int max_size);
    private:
        int **m_values;
        int m_max_size;
        int m_size;
};

Set::Set(int max_size) 
{
    m_size = 1;
    m_max_size = max_size;

    // create an array of pointers to integers.
    m_values = new int *[m_max_size];

}

void Set::insert(int i)
{
    // since m_values is an array of pointers, we have to 
    // dynamically allocate memory to hold the integer value
    m_values[m_size] = new int(i);
    m_size++;
}

void Set::print()
{
    for (int i = 0; i < m_size; i++)
    {
        cout << "set[" << i << "] = " << *m_values[i] << endl;
    }
}

int main()
{
    // create a Set object that can hold 3 numbers
    Set set(3);

    set.insert(1);
    set.insert(2);
    set.insert(3);

    set.print();

    return 0;
}
