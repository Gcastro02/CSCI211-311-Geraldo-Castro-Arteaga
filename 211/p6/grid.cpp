#include "grid.h"
#include <iostream>
using namespace std;

Grid::Grid() {
    // Initialize the 60x24 grid with spaces
    for (int i = 0; i < 24; ++i) {
        for (int j = 0; j < 60; ++j) {
            grid[i][j] = ' ';
        }
    }
}

void Grid::set(int x, int y, char c) {
    // Set the character c at position (x, y) if within bounds
    if (x >= 0 && x < 60 && y >= 0 && y < 24) {
        grid[y][x] = c;
    }
}

void Grid::print() const {
    // Print the grid to the standard output
    for (int i = 0; i < 24; ++i) {
        for (int j = 0; j < 60; ++j) {
            cout << grid[i][j];
        }
        cout << endl;
    }
}