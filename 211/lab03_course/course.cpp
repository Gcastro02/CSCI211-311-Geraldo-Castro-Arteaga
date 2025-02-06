#include "course.h"
using namespace std;

Course::Course(string dept, int number, int time) : department(dept), courseNumber(number), time(time) {}

void Course::print() {
    cout << department << " "<< courseNumber << " at " << time << "\n";
}