#include <iostream>
#include <assert.h>
using namespace std;

bool is_array_sorted(int values[], int size)
{
    assert(size > 0); // Ensure the array has at least one element

    // Base case: An array with 0 or 1 element is always sorted
    if (size == 1)
        return true;

    // Check if the last two elements are in order
    if (values[size - 2] > values[size - 1])
        return false;

    // Recursive case: Check the rest of the array
    return is_array_sorted(values, size - 1);
}

int main()
{
    int values[1000];
    int size;
    cout << "Enter integers.  Type control-D when done\n";
    for (size = 0; cin >> values[size]; size++)
      ;
    if (is_array_sorted(values, size))
      cout << "The values you entered ARE sorted\n";
    else cout << "The values you entered ARE NOT sorted\n";
}
