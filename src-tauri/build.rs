fn main() {
    gnu_skip_default_manifest();
    tauri_build::build();
    tests_get_manifest();
}

/// tauri-build вшивает манифест Windows (Common Controls v6) только в бинарники.
/// Без него тестовый exe не стартует (STATUS_ENTRYPOINT_NOT_FOUND), поэтому тот же ресурс отдаём и тестам.
fn tests_get_manifest() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }
    let out = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap());
    for name in ["resource.lib", "libresource.a"] {
        let p = out.join(name);
        if p.exists() {
            println!("cargo:rustc-link-arg-tests={}", p.display());
        }
    }
}

/// GNU-тулчейн (MinGW) сам добавляет в exe свой манифест (`default-manifest.o`), и он конфликтует с манифестом Tauri:
/// линкер оставляет только один, теряется Common Controls v6, и exe не запускается (STATUS_ENTRYPOINT_NOT_FOUND).
/// GCC подключает этот файл, только если находит его в путях поиска, поэтому подкладываем пустой объект
/// с тем же именем через `-B`. На MSVC (CI и релизы) этот код не выполняется.
fn gnu_skip_default_manifest() {
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() != Ok("gnu") || std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }
    let out = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("no-default-manifest");
    let _ = std::fs::create_dir_all(&out);
    let src = out.join("empty.c");
    let obj = out.join("default-manifest.o");
    std::fs::write(&src, "/* пусто: заменяет default-manifest.o из MinGW */\n").unwrap();
    let ok = std::process::Command::new("gcc").arg("-c").arg(&src).arg("-o").arg(&obj).status().is_ok_and(|s| s.success());
    if ok {
        println!("cargo:rustc-link-arg=-B{}", out.display());
    } else {
        println!("cargo:warning=gcc не найден: MinGW добавит свой манифест, и exe может не запуститься");
    }
}
