#include <iostream>
using namespace std;
#include "list.h"

int main()
{
    // instantiate a List class (the constructor takes NO arguments)
    List list;

    int number;
    // Read numbers from standard input until end of input
    while (cin >> number) {
        list.insert_at_end(number);
    }

    // Print all numbers in the list
    list.print();

    // Print the sum of elements in the list
    cout << "sum = " << list.sum() << endl;

    return 0;
}
