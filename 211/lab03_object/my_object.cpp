// replace my_object and My_object with the actual object name

// an object's .cpp file always includes that objects .h file
// never include a .cpp file!
#include <iostream>
using namespace std;

#include "my_object.h"

// example of how functions are specified
void My_object::print()
{
    // the code for the print function goes here

    cout << "hello\n";


}
