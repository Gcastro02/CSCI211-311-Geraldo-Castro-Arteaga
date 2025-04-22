#ifndef GRID_H
#define GRID_H

class Grid {
private:
    char grid[24][60]; // 2D array for the grid

public:
    Grid();
    void set(int x, int y, char c);
    void print() const;
};

#endif