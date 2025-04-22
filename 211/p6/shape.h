// filepath: /drawing-program/drawing-program/src/shape.h
#ifndef SHAPE_H
#define SHAPE_H

#include "grid.h" // Include the full definition of Grid

class Shape {
protected:
    int m_x, m_y;

public:
    Shape(int x, int y);
    virtual ~Shape();
    virtual void draw(Grid &grid) = 0; // Pure virtual function
};

#endif