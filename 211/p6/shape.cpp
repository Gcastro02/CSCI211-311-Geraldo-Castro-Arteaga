#include "shape.h"

// Constructor for Shape
Shape::Shape(int x, int y) : m_x(x), m_y(y) {}

// Virtual destructor for Shape
Shape::~Shape() {}

// The draw() function remains pure virtual and is not implemented here.
// Derived classes must override it.