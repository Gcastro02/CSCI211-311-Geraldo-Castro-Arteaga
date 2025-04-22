#include "triangle.h"
#include "grid.h"

Triangle::Triangle(int x, int y) : Shape(x, y) {}

void Triangle::draw(Grid &grid) {
    // Drawing a simple triangle shape on the grid
    grid.set(m_x, m_y, '+');         // Top point
    grid.set(m_x - 1, m_y + 1, '+'); // Left point
    grid.set(m_x + 1, m_y + 1, '+'); // Right point
    grid.set(m_x, m_y + 2, '+');     // Middle bottom point
    grid.set(m_x - 1, m_y + 2, '+'); // Bottom left point
    grid.set(m_x + 1, m_y + 2, '+'); // Bottom right point
}