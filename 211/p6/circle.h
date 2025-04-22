#ifndef CIRCLE_H
#define CIRCLE_H

#include "shape.h"

class Circle : public Shape {
public:
    Circle(int x, int y);
    void draw(Grid &grid) override;
};

#endif