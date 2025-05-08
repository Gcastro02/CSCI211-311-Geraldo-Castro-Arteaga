#include <iostream>
#include <string>
#include <vector>
#include <limits>
#include "bst.h"

using namespace std;

void printVector(const vector<string>& values) {
    if (values.empty()) {
        cout << "{}\n";
    } else {
        cout << "{";
        for (size_t i = 0; i < values.size(); ++i) {
            cout << values[i];
            if (i < values.size() - 1) {
                cout << ", ";
            }
        }
        cout << "}\n";
    }
}

int main() {
    BST tree;
    string command;
    string argument;

    while (cin >> command) {
        if (command == "echo" || command == "insert" || command == "find") {
            cin.ignore(); // Ignore the space after the command
            getline(cin, argument); // Read the entire line for the argument
        }

        if (command == "echo") {
            cout << argument << endl;
        } else if (command == "insert") {
            if (!tree.insert(argument)) {
                cerr << "insert " <<"<" << argument << ">" << " failed. String already in tree.\n";
            }
        } else if (command == "size") {
            cout << tree.size() << endl;
        } else if (command == "find") {
            if (tree.find(argument)) {
                cout << "<" << argument << "> is in tree.\n";
            } else {
                cout << "<" << argument << "> is not in tree.\n";
            }
        } else if (command == "print") {
            vector<string> values;
            tree.print(values);
            printVector(values);
        } else if (command == "breadth") {
            vector<string> values;
            tree.breadth(values);
            printVector(values);
        } else if (command == "distance") {
            cout << "Average distance of nodes to root = " << tree.distance() << endl;
        } else if (command == "balanced") {
            if (tree.balanced() != -1) {
                cout << "Tree is balanced.\n";
            } else {
                cout << "Tree is not balanced.\n";
            }
        } else if (command == "rebalance") {
            tree.rebalance();
        } else {
            cerr << "Illegal command " << "<" << command << ">" << ".\n";
            cin.ignore(numeric_limits<streamsize>::max(), '\n'); // Skip the rest of the line
        }
    }

    return 0;
}