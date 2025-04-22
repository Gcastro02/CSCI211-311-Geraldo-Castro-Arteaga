#include "square.h"
#include "grid.h"

Square::Square(int x, int y, int size) : Shape(x, y), m_size(size) {}

void Square::draw(Grid &grid) {
    for (int i = 0; i < m_size; ++i) {
        for (int j = 0; j < m_size; ++j) {
            grid.set(m_x + i, m_y + j, '*'); // Use m_x and m_y from the Shape base class
        }
    }
}