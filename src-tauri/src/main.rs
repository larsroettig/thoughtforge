use clap::Parser;
use thoughtforge_lib::cli::{Cli, Command};

fn main() {
    // Pipe output to head/grep/etc. without a broken-pipe panic.
    // SAFETY: called once at process start before any threads exist.
    #[cfg(unix)]
    unsafe { libc::signal(libc::SIGPIPE, libc::SIG_DFL); }

    let cli = Cli::parse();

    // Daemon must fork before tokio spawns any threads.
    #[cfg(unix)]
    if cli.daemon {
        daemonize();
    }

    let open_browser = !cli.http && !cli.daemon;

    match cli.command {
        None | Some(Command::Serve) => thoughtforge_lib::run(open_browser, cli.port),
        Some(cmd)                   => thoughtforge_lib::cli::run_cli(cmd),
    }
}

/// Fork into the background and detach from the controlling terminal.
///
/// # Safety
/// Must be called before the tokio runtime starts. Forking a multi-threaded
/// process is undefined behaviour; here we are still single-threaded (argument
/// parsing only). The child redirects all stdio to /dev/null and creates a new
/// session via setsid() so it is not tied to the parent's terminal.
#[cfg(unix)]
fn daemonize() {
    unsafe {
        let pid = libc::fork();
        if pid < 0 {
            eprintln!("fork failed");
            std::process::exit(1);
        }
        if pid > 0 {
            println!("thoughtforge daemon started (PID {})", pid);
            std::process::exit(0);
        }
        libc::setsid();
        let devnull = libc::open(b"/dev/null\0".as_ptr() as *const libc::c_char, libc::O_RDWR);
        if devnull >= 0 {
            libc::dup2(devnull, 0);
            libc::dup2(devnull, 1);
            libc::dup2(devnull, 2);
            libc::close(devnull);
        }
    }
}
