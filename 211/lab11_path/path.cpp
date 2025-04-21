#include <iostream>
#include <vector>
#include "location.h"

using namespace std;

int main() {
    vector<Location *> locations; // Vector to store pointers to Location objects
    double latitude, longitude;

    // Read latitude and longitude from standard input
    while (cin >> latitude >> longitude) {
        // Create a new Location object and add it to the vector
        locations.push_back(new Location(latitude, longitude));
    }

    // Traverse the vector and print each Location
    for (Location *loc : locations) {
        loc->print(cout);
        cout << endl;
    }

    // Clean up memory (optional for this lab)
    for (Location *loc : locations) {
        delete loc;
    }

    return 0;
}