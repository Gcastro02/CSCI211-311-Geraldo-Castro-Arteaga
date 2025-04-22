#include "circle.h"
#include "grid.h"
#include <cmath>

Circle::Circle(int x, int y) : Shape(x, y) {}

void Circle::draw(Grid &grid) {
    int radius = 3; // Example radius
    for (int i = -radius; i <= radius; ++i) {
        for (int j = -radius; j <= radius; ++j) {
            // Check if the point is approximately on the circle's edge
            if (std::abs(std::sqrt(i * i + j * j) - radius) < 0.5) {
                grid.set(m_x + i, m_y + j, 'o'); // Use m_x and m_y from Shape
            }
        }
    }
}