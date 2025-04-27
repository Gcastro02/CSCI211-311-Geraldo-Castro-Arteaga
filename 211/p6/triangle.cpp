#include "triangle.h"
#include "grid.h"

Triangle::Triangle(int x, int y) : Shape(x, y) {}

void Triangle::draw(Grid &grid) {
    // Shifting the triangle one space to the right
    grid.set(m_x + 2, m_y, '+');         // Top point
    grid.set(m_x + 1, m_y + 1, '+');     // Left point
    grid.set(m_x + 3, m_y + 1, '+');     // Right point
    grid.set(m_x, m_y + 2, '+');         // Bottom left point
    grid.set(m_x + 1, m_y + 2, '+');     // Bottom middle-left point
    grid.set(m_x + 2, m_y + 2, '+');     // Bottom middle point
    grid.set(m_x + 3, m_y + 2, '+');     // Bottom middle-right point
    grid.set(m_x + 4, m_y + 2, '+');     // Bottom right point
}