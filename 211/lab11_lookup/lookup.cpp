#include <iostream>
#include <map>
#include <string>
#include "location.h"

using namespace std;

int main() {
    map<string, Location *> locationMap; // Map to store title and Location pointer pairs
    double latitude, longitude;
    string title;

    // Read GPS locations and titles until 0 is entered
    while (cin >> latitude) {
        if (latitude == 0) break; // Stop reading when 0 is entered
        cin >> longitude >> title;
        locationMap[title] = new Location(latitude, longitude);
    }

    // Read titles to look up until end of input
    while (cin >> title) {
        auto it = locationMap.find(title);
        if (it != locationMap.end()) {
            // If the title is found, print the associated location
            cout << title << " is at ";
            it->second->print(cout);
            cout << endl;
        } else {
            // If the title is not found, print an error message
            cout << title << " not in database" << endl;
        }
    }

    // Clean up dynamically allocated memory
    for (auto &pair : locationMap) {
        delete pair.second;
    }

    return 0;
}