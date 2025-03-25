#include <iostream>
#include <sstream>
#include <cmath>
#include <string>
#include <vector>
#include "dstack.h"

using namespace std;

void error() {
    cerr << "Error: Invalid expression." << endl;
    exit(1);
}

bool isNumber(const string& token) {
    istringstream iss(token);
    double value;
    char leftover;

    if (iss >> value) {
        if (iss >> leftover) {
            return false;
        }
        return true;
    }
    return false;
}

// Function to trim leading and trailing whitespace from a string
string trim(const string& str) {
    size_t first = str.find_first_not_of(' ');
    if (string::npos == first) {
        return "";
    }
    size_t last = str.find_last_not_of(' ');
    return str.substr(first, (last - first + 1));
}

// Function to split a string into tokens based on whitespace and operators
vector<string> tokenize(const string& str) {
    vector<string> tokens;
    string token;
    for (char ch : str) {
        if (isspace(ch)) {
            if (!token.empty()) {
                tokens.push_back(token);
                token.clear();
            }
        } else if (ch == '+' || ch == '-' || ch == '*' || ch == '/' || ch == '^') {
            if (!token.empty()) {
                tokens.push_back(token);
                token.clear();
            }
            tokens.push_back(string(1, ch));
        } else {
            token += ch;
        }
    }
    if (!token.empty()) {
        tokens.push_back(token);
    }
    return tokens;
}

int main() {
    Dstack stack;
    string line;
    double value;

    while (getline(cin, line)) {
        line = trim(line); // Remove leading/trailing whitespace
        vector<string> tokens = tokenize(line); // Split into tokens

        for (const string& token : tokens) {
            if (isNumber(token)) {
                istringstream(token) >> value;
                stack.push(value);
            } else if (token == "+" || token == "-" || token == "*" || token == "/" || token == "^") {
                if (stack.size() < 2) {
                    error();
                }

                double operand2, operand1;
                stack.pop(operand2);
                stack.pop(operand1);

                if (token == "+") {
                    stack.push(operand1 + operand2);
                } else if (token == "-") {
                    stack.push(operand1 - operand2);
                } else if (token == "*") {
                    stack.push(operand1 * operand2);
                } else if (token == "/") {
                    if (operand2 == 0) {
                        error();
                    }
                    stack.push(operand1 / operand2);
                } else if (token == "^") {
                    // Check for domain errors
                    if (operand1 < 0 && floor(operand2) != operand2) {
                        error();
                    }
                    // Check for zero base and negative exponent
                    if (operand1 == 0 && operand2 < 0) {
                        error();
                    }
                    stack.push(pow(operand1, operand2));
                }
            } else {
                error();
            }
        }
    }

    if (stack.size() != 1) {
        error();
    }

    double result;
    stack.pop(result);
    cout << result << endl;

    return 0;
}