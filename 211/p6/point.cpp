#include "point.h"

Point::Point(int x, int y, char letter) : Shape(x, y), m_letter(letter) {}

void Point::draw(Grid &grid) {
    grid.set(m_x, m_y, m_letter); // Use m_x and m_y from the Shape base class
}