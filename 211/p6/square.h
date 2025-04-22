#ifndef SQUARE_H
#define SQUARE_H

#include "shape.h"

class Square : public Shape {
private:
    int m_size;

public:
    Square(int x, int y, int size);
    void draw(Grid &grid) override;
};

#endif