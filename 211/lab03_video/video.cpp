#include "video.h"
#include <iostream>
using namespace std;

Video::Video(string t, string u, string c, double l, int r) 
    : title(t), url(u), comment(c), length(l), rating(r) {}

void Video::print() {
    cout << title << ", " << url << ", " << comment << ", " << length << ", " << rating << "\n";
}