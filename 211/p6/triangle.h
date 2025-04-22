// filepath: /drawing-program/drawing-program/src/triangle.h
#ifndef TRIANGLE_H
#define TRIANGLE_H

#include "shape.h"

class Triangle : public Shape {
public:
    Triangle(int x, int y);
    void draw(Grid &grid) override;
};

#endif