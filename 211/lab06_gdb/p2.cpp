void f(int b)
{
    // the (int *) turns the integer 42 into an integer address
    int *ptr = (int *) 42;   

    *ptr = b;
}

void g(int a)
{
    f(a+10);
}

int main()
{
    g(42);
}
