#include <iostream>
#include <ctype.h>
#include <assert.h>
using namespace std;

bool is_int(char str[])
{
    // Base case: If the string is empty, it is not an integer
    if (str[0] == '\0')
        return false;

    // Check if the first character is a valid digit or a decimal point
    if (!isdigit(str[0]) && str[0] != '.')
        return false;

    // Ensure there is at most one decimal point
    int decimal_count = 0;
    for (int i = 0; str[i] != '\0'; i++) {
        if (str[i] == '.') {
            decimal_count++;
            if (decimal_count == 1)
                return false; 
        } else if (!isdigit(str[i])) {
            return false; // Non-digit character found
        }
    }

    // If the string passes all checks, it is a valid number
    return true;
}

int main()
{
    char buf[1000];
    cout << "Enter a string: ";
    cin >> buf;

    if (is_int(buf))
        cout << "<" << buf << "> is an integer.\n";
    else
        cout << "<" << buf << "> is NOT an integer.\n";
}
