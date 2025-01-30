// chart.cpp
// Geraldo Castro
// gcastroarteaga
// User inputs a number and a chart is made using astericks and spaces

#include <iostream>

int maxvalue(int values[], int count);

using namespace std;

int main() {

// Sets the max value of 100 
    const int MAX = 100;
    int values[MAX];
    int count = 0;

// Read input values
    int value = 0;
    while (count < MAX) {
        cin >> value;
        if (value == 0) {
            break;
        }
        values[count] = value;
        count++;
    }

    int max_value = maxvalue(values, count);

// Print the bar chart
    for (int i = max_value; i > 0; i--) {
        for (int j = 0; j < count; j++) {
            if (values[j] >= i) {
                cout << "*";
            } else {
                cout << " ";
            }
            cout << " ";
        }
        cout << endl;
    }

    return 0;
}

// Find the maximum value
int maxvalue(int values[], int count) {
    int max_value = 0;
    for (int i = 0; i < count; i++) {
        if (values[i] > max_value) {
            max_value = values[i];
        }
    }
    return max_value;
}