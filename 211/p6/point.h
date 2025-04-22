#ifndef POINT_H
#define POINT_H

#include "shape.h"

class Point : public Shape {
private:
    char m_letter;

public:
    Point(int x, int y, char letter);
    void draw(Grid &grid) override;
};

#endif // POINT_H