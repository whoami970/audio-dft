
class AudioHandler {
    constructor() {
        navigator.mediaDevices.getUserMedia({ audio:true })
        .then(
            (stream) => {
                this.audio_context = new AudioContext();
                this.stream = stream;

                this.stream.getAudioTracks().forEach((track) => {
                    track.applyConstraints({
                        echoCancellation:false,
                        autoGainControl:false,
                        //noiseSuppression:false
                    });
                });

                // delayed playback
                this.delay = this.audio_context.createDelay(2);
                this.delay.delayTime.setValueAtTime(2, this.audio_context.currentTime);

                this.gain = this.audio_context.createGain();
                this.gain.gain.setValueAtTime(0, this.audio_context.currentTime);

                this.mic = this.audio_context.createMediaStreamSource(this.stream);

                this.fft = this.audio_context.createAnalyser();
                this.fft.smoothingTimeConstant = 0;
                this.fft.fftSize = 4*4096;

                this.mic.connect(this.fft);

                this.mic.connect(this.delay);
                this.delay.connect(this.gain);
                this.gain.connect(this.audio_context.destination);

                this.freq_data = new Uint8Array(audio_handler.fft.frequencyBinCount);
            })
        .catch(
            (err) => {
                alert(err);
            }
        );
    }
    set height_target(height) {
        // bin_count = fft_size/2
        // bin_count = next_power_of_2(target)
        // =>
        // fft_size = 2 * next_power_of_2(target)
        // ^ this would be required to fill whole screen
        // the following makes it even larger to zoom in on relevant frequencies:
        let new_fft_size = 2**(Math.round(Math.log2(height)) + 1 + 4);
        new_fft_size = Math.min(new_fft_size, 32768);
        if (this.fft.fftSize != new_fft_size) {
            this.fft.fftSize = new_fft_size;
        }
        // resize frequency data array
        if (this.freq_data.length != audio_handler.fft.frequencyBinCount) {
            this.freq_data = new Uint8Array(audio_handler.fft.frequencyBinCount);
        }
    }
    get_freq_data() {
        this.fft.getByteFrequencyData(this.freq_data);
        return this.freq_data;
    }
    set_gain(value) {
        if (this.gain) {
            if (this.gain.gain.value != value) {
                this.gain.gain.setValueAtTime(value, this.audio_context.currentTime);
            }
        }
    }
}

function heatmap(t) {
    // https://www.desmos.com/calculator/iewwovppe4
    let b = Math.max(1-t/128, 0);
    let g = Math.max(Math.min(t/128, 2-t/128), 0);
    let r = Math.max(-1+t/128, 0);
    let a = 1;
    return [r, g, b, a];
}

// canvas for drawing frequency data
const canvas = document.getElementById("graph_canvas");
const context = canvas.getContext("2d", { alpha: false });

// whether the canvas was resized this frame
let resize = true;

// audio input and analysis
let audio_handler = new AudioHandler();

// x position to draw frequency data
let draw_x = 0;
// array to store frequency data
let img_data = new Uint8ClampedArray(0);

let mute_disable = document.getElementById("mute");

function draw() {
    resize = canvas.width != window.innerWidth || canvas.height != window.innerHeight;

    if (resize) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        draw_x = 0;
    }

    if (mute_disable.checked) {
        audio_handler.set_gain(1);
    } else {
        audio_handler.set_gain(0);
    }

    if (audio_handler.fft) {
        audio_handler.height_target = canvas.height;

        let freq_data = audio_handler.get_freq_data();

        if (img_data.length != audio_handler.fft.frequencyBinCount*4) {
            // array size changed
            img_data = new Uint8ClampedArray(audio_handler.fft.frequencyBinCount*4);
        }
        for (let i = 0; i < freq_data.length * 4; i++) {
            let [r, g, b, a] = heatmap(freq_data[freq_data.length-i]);
            img_data[4*i + 0] = 255 * r;
            img_data[4*i + 1] = 255 * g;
            img_data[4*i + 2] = 255 * b;
            img_data[4*i + 3] = 255 * a;
        }

        context.putImageData(new ImageData(img_data, 1), draw_x, canvas.height - freq_data.length);

        context.fillStyle = "rgb(0 0 0)";
        context.fillRect(draw_x + 1, 0, 1, canvas.height);

        if (++draw_x > canvas.width) {
            draw_x = 0;
        }
    }

    resize = false;
    window.requestAnimationFrame(draw);
}

window.requestAnimationFrame(draw);

