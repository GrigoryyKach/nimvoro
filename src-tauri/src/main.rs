// Без консольного окна в релизной сборке.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nimvoro_lib::run()
}
