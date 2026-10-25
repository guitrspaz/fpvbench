#import <Cocoa/Cocoa.h>
#import <dispatch/dispatch.h>
#import <stdio.h>

/* The native UI invokes the bundled runtime directly. It never constructs a shell command. */
static NSDictionary *RunHelper(BOOL install, BOOL login) {
    NSString *payload = [[[NSBundle mainBundle] resourcePath] stringByAppendingPathComponent:@"payload"];
    NSString *node = [payload stringByAppendingPathComponent:@"node/bin/node"];
    NSString *script = [payload stringByAppendingPathComponent:@"app/src/macos-installer.mjs"];
    NSMutableArray *arguments = [NSMutableArray arrayWithArray:@[script, @"--payload", payload, install ? @"--install" : @"--check"]];
    if (!login) [arguments addObject:@"--no-login"];
    NSTask *task = [[NSTask alloc] init];
    task.executableURL = [NSURL fileURLWithPath:node];
    task.arguments = arguments;
    NSMutableDictionary *environment = [[[NSProcessInfo processInfo] environment] mutableCopy];
    for (NSString *name in @[@"NODE_OPTIONS", @"NODE_PATH", @"FPVBENCH_DATA_DIR", @"PORT", @"DYLD_INSERT_LIBRARIES"]) {
        [environment removeObjectForKey:name];
    }
    task.environment = environment;
    task.standardInput = [NSFileHandle fileHandleWithNullDevice];
    NSPipe *pipe = [NSPipe pipe];
    task.standardOutput = pipe;
    task.standardError = pipe;
    NSError *launchError = nil;
    if (![task launchAndReturnError:&launchError]) {
        return @{@"status": @"error", @"message": @"This installer could not start its included runtime. Keep your existing files and use a fresh copy of the installer."};
    }
    NSMutableData *captured = [NSMutableData data];
    while (YES) {
        NSData *part = [[pipe fileHandleForReading] readDataOfLength:8192];
        if (part.length == 0) break;
        if (captured.length + part.length <= 1024 * 1024) [captured appendData:part];
    }
    [task waitUntilExit];
    NSString *output = [[NSString alloc] initWithData:captured encoding:NSUTF8StringEncoding];
    NSArray *lines = [output componentsSeparatedByCharactersInSet:[NSCharacterSet newlineCharacterSet]];
    for (NSString *line in [lines reverseObjectEnumerator]) {
        NSData *bytes = [line dataUsingEncoding:NSUTF8StringEncoding];
        id decoded = bytes ? [NSJSONSerialization JSONObjectWithData:bytes options:0 error:nil] : nil;
        if (![decoded isKindOfClass:[NSDictionary class]]) continue;
        NSDictionary *result = decoded;
        NSString *status = result[@"status"];
        if ([status isEqualToString:@"error"] && [result[@"message"] isKindOfClass:[NSString class]]) return result;
        if (task.terminationStatus == 0 && [@[@"ready", @"installed", @"already-installed"] containsObject:status] &&
            [result[@"launcher"] isKindOfClass:[NSString class]] && [result[@"launcher"] hasPrefix:@"/"]) return result;
    }
    return @{@"status": @"error", @"message": @"The installation check did not finish. Your existing installation was not replaced. See the source setup guide before retrying."};
}

@interface InstallerDelegate : NSObject <NSApplicationDelegate, NSWindowDelegate>
@property (strong) NSWindow *progressWindow;
@property (strong) NSTextField *statusLabel;
@property (strong) NSProgressIndicator *spinner;
@property BOOL installing;
@end

@implementation InstallerDelegate
- (void)showProgress:(NSString *)text installing:(BOOL)installing {
    self.installing = installing;
    if (!self.progressWindow) {
        self.progressWindow = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 480, 150)
            styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable
            backing:NSBackingStoreBuffered defer:NO];
        self.progressWindow.title = @"FPVBench Installer";
        self.progressWindow.delegate = self;
        self.progressWindow.releasedWhenClosed = NO;
        self.statusLabel = [NSTextField wrappingLabelWithString:text];
        self.statusLabel.frame = NSMakeRect(64, 56, 390, 50);
        self.statusLabel.font = [NSFont systemFontOfSize:14];
        [self.progressWindow.contentView addSubview:self.statusLabel];
        self.spinner = [[NSProgressIndicator alloc] initWithFrame:NSMakeRect(22, 72, 24, 24)];
        self.spinner.style = NSProgressIndicatorStyleSpinning;
        [self.progressWindow.contentView addSubview:self.spinner];
        [self.progressWindow center];
    }
    self.statusLabel.stringValue = text;
    [[self.progressWindow standardWindowButton:NSWindowCloseButton] setEnabled:!installing];
    [self.spinner startAnimation:nil];
    [self.progressWindow makeKeyAndOrderFront:nil];
}
- (BOOL)windowShouldClose:(NSWindow *)sender {
    if (self.installing) return NO;
    [NSApp terminate:nil];
    return YES;
}
- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {
    return self.installing ? NSTerminateCancel : NSTerminateNow;
}
- (void)showError:(NSDictionary *)result {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"FPVBench could not finish";
    alert.informativeText = [result[@"message"] isKindOfClass:[NSString class]] ? result[@"message"] : @"Keep your files and check the setup guide before trying again.";
    alert.alertStyle = NSAlertStyleWarning;
    [alert addButtonWithTitle:@"OK"];
    [alert runModal];
    [NSApp terminate:nil];
}
- (void)openLauncher:(NSDictionary *)result {
    NSURL *url = [NSURL fileURLWithPath:result[@"launcher"]];
    if (![[NSWorkspace sharedWorkspace] openURL:url]) {
        [self showError:@{@"message": @"FPVBench is installed, but its launcher could not open. Find FPVBench in your home Applications folder and open it there."}];
        return;
    }
    [NSApp terminate:nil];
}
- (void)runAction:(BOOL)install login:(BOOL)login {
    [self showProgress:install ? @"Installing FPVBench for your user account…" : @"Checking this installer and your existing installation…"
             installing:install];
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        NSDictionary *result = RunHelper(install, login);
        dispatch_async(dispatch_get_main_queue(), ^{
            self.installing = NO;
            [self.spinner stopAnimation:nil];
            [self.progressWindow orderOut:nil];
            NSString *status = result[@"status"];
            if ([status isEqualToString:@"error"]) { [self showError:result]; return; }
            if ([status isEqualToString:@"installed"]) { [self openLauncher:result]; return; }
            if ([status isEqualToString:@"already-installed"]) {
                NSAlert *alert = [[NSAlert alloc] init];
                alert.messageText = @"FPVBench is already installed";
                alert.informativeText = @"This preview leaves your existing app and records unchanged. Open your current FPVBench app?";
                [alert addButtonWithTitle:@"Open FPVBench"];
                [alert addButtonWithTitle:@"Cancel"];
                if ([alert runModal] == NSAlertFirstButtonReturn) [self openLauncher:result];
                else [NSApp terminate:nil];
                return;
            }
            NSAlert *alert = [[NSAlert alloc] init];
            alert.messageText = @"Install FPVBench";
            alert.informativeText = @"Installs FPVBench in your home Applications folder and opens it in your browser. Your records stay on this Mac. No administrator password is needed.\n\nThis is a local preview for macOS 14 or newer on Apple Silicon. It has not been notarized for public download.";
            [alert addButtonWithTitle:@"Install and Open"];
            [alert addButtonWithTitle:@"Cancel"];
            NSButton *loginChoice = [NSButton checkboxWithTitle:@"Start FPVBench when I log in" target:nil action:nil];
            loginChoice.state = NSControlStateValueOn;
            loginChoice.frame = NSMakeRect(0, 0, 300, 28);
            alert.accessoryView = loginChoice;
            if ([alert runModal] == NSAlertFirstButtonReturn) [self runAction:YES login:loginChoice.state == NSControlStateValueOn];
            else [NSApp terminate:nil];
        });
    });
}
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [NSApp activateIgnoringOtherApps:YES];
    [self runAction:NO login:YES];
}
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        /* A read-only native proof path verifies the same bundle/helper boundary without opening UI. */
        if (argc == 2 && strcmp(argv[1], "--verify-payload") == 0) {
            NSDictionary *result = RunHelper(NO, YES);
            NSData *json = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
            if (json) { fwrite(json.bytes, 1, json.length, stdout); fputc('\n', stdout); }
            return [result[@"status"] isEqualToString:@"error"] ? 1 : 0;
        }
        NSApplication *app = [NSApplication sharedApplication];
        InstallerDelegate *delegate = [[InstallerDelegate alloc] init];
        app.delegate = delegate;
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];
        [app run];
    }
    return 0;
}
