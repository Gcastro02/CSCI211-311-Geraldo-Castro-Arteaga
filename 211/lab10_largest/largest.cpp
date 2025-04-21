#include <iostream>
#include <assert.h>
using namespace std;

int largest_in_array_helper(int values[], int size, int current_max)
{
    // Base case: if size is 0, return the current maximum
    if (size == 0)
        return current_max;

    // Update the current maximum if the current element is larger
    if (values[size - 1] > current_max)
        current_max = values[size - 1];

    // Recursive case: process the rest of the array
    return largest_in_array_helper(values, size - 1, current_max);
}

int largest_in_array(int values[], int size)
{
    assert(size > 0); // Ensure the array has at least one element
    // Start the recursion with the first element as the initial maximum
    return largest_in_array_helper(values, size, values[0]);
}

int main()
{
    int values[1000];
    int size;
    cout << "Enter integers.  Type control-D when done\n";
    for (size = 0; cin >> values[size]; size++)
      ;
    cout << "The largest value is " << largest_in_array(values, size) << endl;
}
