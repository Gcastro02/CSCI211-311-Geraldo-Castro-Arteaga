#ifndef COURSE_H
#define COURSE_H

#include <string>
#include <iostream>

class Course {
    private:
        std::string department;
        int courseNumber;
        int time;

    public:
        Course(std::string dept, int number, int time);
        void print();
};

#endif