#include "circle.h"
#include "grid.h"
#include <cmath>

Circle::Circle(int x, int y) : Shape(x, y) {}

void Circle::draw(Grid &grid) {
    // Adjust the loops to cover the bounding box of the desired relative coordinates
    for (int i = -1; i <= 2; ++i) {
        for (int j = 1; j <= 4; ++j) {
            // Check if the current relative (i, j) corresponds to an 'o' in the target shape.
            // This replaces the distance check to produce the specific pattern.
            if ((i == 0 && j == 1) || (i == 1 && j == 1) ||
                (i == -1 && j == 2) || (i == 2 && j == 2) ||
                (i == -1 && j == 3) || (i == 2 && j == 3) ||
                (i == 0 && j == 4) || (i == 1 && j == 4)) {
                grid.set(m_x + i + 1, m_y + j - 1, 'o'); // Shift the circle one line to the right
            }
        }
    }
}