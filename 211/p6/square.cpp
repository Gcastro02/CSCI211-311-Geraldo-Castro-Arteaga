#include "square.h"
#include "grid.h"

Square::Square(int x, int y, int size) : Shape(x, y), m_size(size) {}

void Square::draw(Grid &grid) {
    for (int i = 0; i < m_size; ++i) {
        for (int j = 0; j < m_size; ++j) {
            // Draw the border of the square
            if (i == 0 || i == m_size - 1 || j == 0 || j == m_size - 1) {
                grid.set(m_x + i, m_y + j, '*');
            }
        }
    }
}