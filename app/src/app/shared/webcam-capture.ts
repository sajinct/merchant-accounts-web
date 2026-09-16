import {
  Component,
  effect,
  ElementRef,
  input,
  OnDestroy,
  output,
  signal,
  computed,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

const MAX_WIDTH = 640;

/**
 * Take a photo with the browser camera. Emits a JPEG blob on capture, or null when the
 * photo is cleared. `src` shows the existing photo.
 */
@Component({
  selector: 'app-webcam-capture',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="webcam-frame">
      <video #video autoplay playsinline muted [hidden]="!streaming()"></video>
      @if (!streaming()) {
        @if (preview(); as url) {
          <img [src]="url" alt="Member photo" />
        } @else {
          <div class="webcam-empty"><mat-icon>person</mat-icon><span>No photo</span></div>
        }
      }
    </div>
    <div class="webcam-actions">
      @if (streaming()) {
        <button mat-flat-button type="button" (click)="capture()">
          <mat-icon>photo_camera</mat-icon> Capture
        </button>
        <button mat-button type="button" (click)="stop()">Cancel</button>
      } @else {
        <button mat-stroked-button type="button" (click)="start()" [disabled]="disabled()">
          <mat-icon>videocam</mat-icon> Camera
        </button>
        @if (preview()) {
          <button mat-button type="button" (click)="clear()" [disabled]="disabled()">Clear</button>
        }
      }
    </div>
    @if (cameraError()) {
      <div class="webcam-error">{{ cameraError() }}</div>
    }
  `,
})
export class WebcamCapture implements OnDestroy {
  readonly src = input<string | null>(null);
  readonly disabled = input(false);
  readonly captured = output<Blob | null>();

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private stream: MediaStream | null = null;
  private readonly localUrl = signal<string | null>(null);
  private readonly cleared = signal(false);

  protected readonly streaming = signal(false);
  protected readonly cameraError = signal('');
  protected readonly preview = computed(
    () => this.localUrl() ?? (this.cleared() ? null : this.src()),
  );

  constructor() {
    // A different record was loaded: drop any unsaved capture.
    effect(() => {
      this.src();
      untracked(() => {
        this.stop();
        this.setLocalUrl(null);
        this.cleared.set(false);
      });
    });
  }

  async start(): Promise<void> {
    this.cameraError.set('');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      this.video().nativeElement.srcObject = this.stream;
      this.streaming.set(true);
    } catch {
      this.cameraError.set('No camera available, or permission was denied.');
    }
  }

  capture(): void {
    const video = this.video().nativeElement;
    const scale = Math.min(1, MAX_WIDTH / (video.videoWidth || MAX_WIDTH));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((video.videoWidth || MAX_WIDTH) * scale);
    canvas.height = Math.round((video.videoHeight || 480) * scale);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          this.setLocalUrl(URL.createObjectURL(blob));
          this.captured.emit(blob);
        }
        this.stop();
      },
      'image/jpeg',
      0.85,
    );
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.streaming.set(false);
  }

  clear(): void {
    this.setLocalUrl(null);
    this.cleared.set(true);
    this.captured.emit(null);
  }

  ngOnDestroy(): void {
    this.stop();
    this.setLocalUrl(null);
  }

  private setLocalUrl(url: string | null): void {
    const previous = this.localUrl();
    if (previous) {
      URL.revokeObjectURL(previous);
    }
    this.localUrl.set(url);
  }
}
