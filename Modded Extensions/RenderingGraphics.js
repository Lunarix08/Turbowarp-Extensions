// Post-Processing By: (Can't find the original author)
// Post-AIO By: Xxy_ (https://space.bilibili.com/1296271783)
// Looks Expanded By: SharkPool & CST1229 (https://scratch.mit.edu/users/CST1229/)
// Fixed & Merged By: Lunarix & Copilot (With some help after merging rendering issues)
// Description: Combination of Post-AIO, Post-Processing, and Looks Expanded extensions, with some adjustments for compatibility and unified features.
let postprocessingClass;
let postAIOClass;
let looksExpandedClass;
let postProcessingDraw = null; 

//Post-Processing
(function (Scratch) {
  "use strict";
 
  function primaryUniformForEffect(name) {
    switch (name) {
      case "glitch":
      case "dispersion":
        return "_Amplitude";
      case "pointillism":
        return "u_threshold";
      case "helleffectshader":
        return "eyes_alpha";
      case "vignette":
        return "extend";
      case "radialblur":
      case "chromatic":
      case "fisheye":
      case "pixelwarp":
        return "power";
      case "wavewarp":
        return "amplitude";
      default:
        return null;
    }
  }
  function convertStrengthValue(effectName, v) {
    // Accept either 0..1 values or percentages (>1 treated as percent)
    const val = Scratch.Cast.toNumber(v);
    if (Math.abs(val) > 1) return val / 100.0;
    return val;
  }
  function applyPipelinePassParams(passIndex, name, program) {
    const params = pipelinePassParams[passIndex];
    if (!params) return;
    const primary = primaryUniformForEffect(name);
    if (primary && Object.prototype.hasOwnProperty.call(params, "__strength")) {
      const loc = gl.getUniformLocation(program, primary);
      if (loc) gl.uniform1f(loc, convertStrengthValue(name, params.__strength));
    }
    // apply any explicitly stored uniforms for this pass
    for (const k in params) {
      if (!Object.prototype.hasOwnProperty.call(params, k)) continue;
      if (k === "__strength") continue;
      const loc = gl.getUniformLocation(program, k);
      if (!loc) continue;
      const v = params[k];
      if (Array.isArray(v)) {
        if (v.length === 2) gl.uniform2fv(loc, v);
        else if (v.length === 3) gl.uniform3fv(loc, v);
        else if (v.length >= 1) gl.uniform1f(loc, v[0]);
      } else {
        gl.uniform1f(loc, Scratch.Cast.toNumber(v));
      }
    }
  }
  const vm = Scratch.vm || {};
  const renderer = vm.renderer || {};
  const gl = renderer._gl;
  const canvas = renderer.canvas || {};
  const runtime = vm.runtime || {};
  const twgl = (renderer.exports && renderer.exports.twgl) || {};
  let SBG = false;
  Scratch.translate.setup({
    zh: {
      opcodeChangePostProcess: 'è®¾ç½®å±å¹ç¹æä¸º[Menu]',
      opcodeChangeGlitch: 'è®¾ç½®æéå¹åº¦ä¸º[Amplitude]%',
      opcodeChangeDispersion: 'è®¾ç½®è²æ£å¹åº¦ä¸º[Amplitude]%',
      opcodeChangeGray: 'è®¾ç½®åè²é¢è²ä¸º[COLOR] %',
      opcodeChangePointillism: 'è®¾ç½®ç¹å»å¯¹æ¯åº¦ä¸º[threshold]%',
      opcodeChangeScreensplit: 'è®¾ç½®å±å¹åçä¸º x:[split_x] y:[split_y]',
      opcodeChangeCliping: 'è®¾ç½®å±å¹è£åªä¸º X:[x1],Y:[y1] To: X:[x2],Y:[y2] ROT[rot]',
      opcodeRequestReDraw:'éæ°å·æ°å±å¹',
      opcodeGetPostProcess:'å½åå±å¹ç¹æ',
      PostProcess_glitch: "æé",
      PostProcess_dispersion: "è²æ£",
      PostProcess_gray: "åè²",
      PostProcess_reverse: "åè²",
      PostProcess_pointillism: "ç¹å»",
      PostProcess_cliping: "è£åª",
      PostProcess_screensplit: "åç",
      PostProcess_helleffectshader: "???",
      PostProcess_none: "æ ",
      PostProcess_pipeline: "å å é¾",
      opcodePipelineAdd: 'å å é¾ æ·»å [Menu]',
      opcodePipelineClear: 'å å é¾ æ¸ç©º',
      opcodeGetPipeline: 'å å é¾ åè¡¨',
      opcodePipelineSetTargetIndex: 'å å é¾ è®¾ç½®ç®æ å±ä¸º[index]',
      opcodePipelineSetTargetPaused: 'å å é¾ å»ç»ç®æ å±è®¡æ¶[paused]',
    }
  });

  var vertexShaderCode = `
      attribute vec4 a_position;
      attribute vec2 a_texcoord;
      varying vec2 v_texcoord;
      varying vec4 vColor;
      void main() {
      gl_Position = vec4(a_position.x, a_position.y, a_position.z, 1);
      v_texcoord = a_texcoord;
      vColor = vec4(1.0, 1.0, 1.0, 1.0);
      }
    `;
  var noneShaderCode = `
    precision mediump float;
      
    varying vec2 v_texcoord;
    varying vec4 vColor;      
    uniform sampler2D u_texture;
  
    void main() {
      gl_FragColor=texture2D(u_texture,v_texcoord);
    }
    `;
  // clipping shader removed in v4 (excluded by request)
  var dispersionShaderCode = `
      precision mediump float;
      
      varying vec2 v_texcoord;
      varying vec4 vColor;      
      uniform sampler2D u_texture;
      uniform float _Amplitude ;
      uniform vec2 direction_r ;
      uniform vec2 direction_g ;
      uniform vec2 direction_b ;
      void main() {
        float ColorR = texture2D(u_texture,v_texcoord + normalize( direction_r )*_Amplitude).r ;
        float ColorG = texture2D(u_texture,v_texcoord + normalize( direction_g )*_Amplitude).g;
        float ColorB = texture2D(u_texture,v_texcoord + normalize( direction_b )*_Amplitude).b;
        gl_FragColor=vec4(ColorR,ColorG,ColorB,1.0);
  
      }
    `;

  var GlitchShaderCode = `
      precision mediump float;
      
      varying vec2 v_texcoord;
      varying vec4 vColor;      
      uniform sampler2D u_texture;
      uniform float _Amplitude;
      uniform float _Time;
      uniform vec2 _BlockSize;
      uniform bool _Rgb;
      uniform vec2 u_pos1;
      uniform vec2 u_pos2;
      uniform vec2 u_dir;
      float randomNoise(vec2 seed)
      {
          return fract(sin(dot(seed *_Time , vec2(17.13, 3.71))) * 43758.5453123);
      }
      void main() {
        float block = randomNoise(floor(v_texcoord * _BlockSize));
        float displaceNoise = pow(block, 8.0) * pow(block, 3.0);
        if (_Rgb){
          float ColorR = texture2D(u_texture,v_texcoord).r;
          float ColorG = texture2D(u_texture,v_texcoord + vec2(displaceNoise * _Amplitude * randomNoise(vec2(7)),0.0)).g;
          float ColorB = texture2D(u_texture,v_texcoord - vec2(displaceNoise * _Amplitude * randomNoise(vec2(13)),0.0)).b;
          gl_FragColor=vec4(ColorR,ColorG,ColorB,1.0);
        }else{
          if (v_texcoord.x > u_pos1.x && v_texcoord.x < u_pos2.x && v_texcoord.y > u_pos1.y && v_texcoord.y < u_pos2.y){
          float offset_s = displaceNoise * _Amplitude * randomNoise(vec2(7)) ;
          vec2 offset = vec2(offset_s * u_dir.x,offset_s * u_dir.y);
          vec4 Color = texture2D(u_texture,vec2(fract(v_texcoord.x+offset.x),fract(v_texcoord.y+offset.y)));
          gl_FragColor=Color;
          }else{
            gl_FragColor= texture2D(u_texture,v_texcoord);
          }
        }
        
  
      }
    `;
  var GrayShaderCode = `
      precision mediump float;
      
      varying vec2 v_texcoord;
      varying vec4 vColor;      
      uniform sampler2D u_texture;
      uniform vec3 _color;
      void main() {
  
        vec4 Color = texture2D(u_texture,v_texcoord);
        float gray = (Color.r + Color.g + Color.b) / 3.0;
        
        gl_FragColor=vec4(vec3(gray) * (_color/255.0),1.0);
  
      }
    `;
  var ReverseShaderCode = `
      precision mediump float;
      
      varying vec2 v_texcoord;
      varying vec4 vColor;      
      uniform sampler2D u_texture;
  
      void main() {
  
        vec4 Color = texture2D(u_texture,v_texcoord);
  
        gl_FragColor=vec4(1.0-Color.r,1.0-Color.g,1.0-Color.b,1.0);
  
      }
    `;
  var PointillismShaderCode = `
    precision mediump float;
  
    uniform sampler2D u_texture;
    uniform float u_size; // Point size
    uniform float u_threshold; // Threshold for black and white dots
    uniform vec2 u_resolution; // Resolution of the canvas
    
    varying vec2 v_texcoord;
    
    void main() {
      // Sample the color from the texture
      vec4 texColor = texture2D(u_texture, v_texcoord);
      
      // Convert the color to grayscale
      float gray = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
      
      // Quantize the grayscale value to either black or white
      float threshold = u_threshold * (1.0 + 0.2 * (sin(v_texcoord.y * u_resolution.y * 10.0) + sin(v_texcoord.x * u_resolution.x * 10.0)));
      float quantized = step(threshold, gray);
      
      // Combine the dot pattern with the quantized color
      gl_FragColor = vec4(vec3( quantized), 1.0);
    }
    `;
  var quadPositions = [-1, -1, -1, 1, 1, -1, 1, -1, -1, 1, 1, 1];

  var quadCoords = [0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1];
  var screensplitShaderCode = `
      precision mediump float;
      
      varying vec2 v_texcoord;
      varying vec4 vColor;      
      uniform sampler2D u_texture;
      uniform vec2 split ;
      uniform vec2 offset ;
      vec2 repeatUV(vec2 suv, float min, float max) {
        return mod(suv, max - min) + min;
    }
      void main() {
        vec4 col = texture2D(u_texture,repeatUV(v_texcoord / split + offset,0.0,1.0)) ;
        gl_FragColor=col;
  
      }
      
    `;
  // where are you getting this shader from?
  var HellShaderCode = `
    //
    // Simple passthrough fragment shader
    //
    precision mediump float;
    varying vec2 v_texcoord;
    varying vec4 vColour;
    uniform sampler2D u_texture;
    uniform float timer;
    uniform float eyes_alpha;
    vec2 size = vec2(740.0, 580.0);
    vec2 centre_pos = vec2(370.0, 230.0);
    vec2 eye1_pos = vec2(200.0, 230.0);
    vec2 eye2_pos = vec2(540.0, 230.0);
    vec3 col1 = vec3(1.0, 0.0, 0.0);
    vec3 col3 = vec3(1.0, 0.5, 0.5);
    vec3 col2 = vec3(0.6, 0.0, 0.5);
    vec3 col4 = vec3(0.8, 0.0, 0.6);
    float max_dis = length(size - centre_pos);
    void main() {
      vec2 pos = v_texcoord * size;
      vec2 pos_waved = pos;
      pos_waved.x += sin(3.1415 / 60.0 * (pos.y + timer * 2.0)) * (sin(3.1415 / (60.0 / 140.0 * 120.0) * timer) * 14.0 + 16.0);
      pos_waved.y += sin(3.1415 / 60.0 * (pos.x + timer * 2.0)) * (sin(3.1415 / (60.0 / 140.0 * 120.0) * timer) * 14.0 + 16.0);
      float dis = length(centre_pos - pos_waved);
      dis *= sin(3.1415 / 20.0 * (dis - timer)) * (cos(3.1415 / (60.0 / 140.0 * 360.0) * timer) * 0.2 + 0.2) + 1.0;
      float k = dis / max_dis;
      float ak = k * 0.75 + 0.25;
      float alpha;
      float mod_flag = mod(dis - timer + 120.0, 120.0);
      if(mod_flag < 5.0 + ak * 25.0) {
        alpha = mod_flag / (5.0 + ak * 25.0);
      } else if(mod_flag < 5.0 + ak * 25.0 + ak * 60.0) {
        alpha = 1.0;
      } else if(mod_flag < (5.0 + ak * 25.0) * 2.0 + ak * 60.0) {
        alpha = ((5.0 + ak * 25.0) * 2.0 + ak * 60.0 - mod_flag) / (5.0 + ak * 25.0);
      } else {
        alpha = 0.0;
      }
      float sk = cos(3.1415 / (60.0 / 140.0 * 240.0) * timer) * 0.7 + 0.3;
      vec3 col_fg = mix(col1, col3, sk);
      vec3 col_bg = mix(col2, col4, sk);
      vec4 col = vec4(mix(col_bg, col_fg, k), alpha * (k * 0.6 + 0.4));
      
      float dis_x = centre_pos.x - pos.x;
      float dis_y = centre_pos.y - pos.y;
      float angle;
      if(dis_x == 0.0) {
        angle = 3.1415 / 2.0;
      } else {
        angle = atan(dis_y / dis_x);
      }
      if(dis_x < 0.0) {
        angle += 3.1415;
      }
      angle = mod(angle / 3.1415 * 180.0 + 360.0, 360.0);
      vec4 light_col;
      light_col.rgb = col2 * 0.5;
      float mod_angle_flag = mod(angle + 270.0 - timer + 72.0, 72.0);
      if(mod_angle_flag <= 5.0) {
        light_col.a = mod_angle_flag / 10.0;
      } else if(mod_angle_flag <= 15.0) {
        light_col.a = 0.5;
      } else if(mod_angle_flag <= 20.0) {
        light_col.a = (20.0 - mod_angle_flag) / 10.0;
      } else {
        light_col.a = 0.0;
      }
        gl_FragColor = vec4((col.rgb + light_col.rgb * light_col.a) * (col.a + light_col.a * (0.4 + col.a * 0.6)), 1.0);
      if(eyes_alpha > 0.0) {
        float x_offset = sin(3.1415 / (60.0 / 140.0 * 360.0) * timer) * 10.0;
        vec3 eyes_col = mix(vec3(0.0, 0.0, 0.0), col3, eyes_alpha * max(1.0 - min(length(pos - eye1_pos - vec2(x_offset, 0.0)), length(pos - eye2_pos - vec2(x_offset, 0.0))) / 100.0, 0.0));
        gl_FragColor = vec4(gl_FragColor.rgb * (1.0 - eyes_alpha * 0.8 * max(length(pos - centre_pos) / max_dis, 0.8)) + eyes_col * 1.6, 1.0);
      }
    }
    
    `;
  var VignetteShaderCode = `
    precision mediump float;
    
    varying vec2 v_texcoord;
    varying vec4 vColor;
    uniform sampler2D u_texture;
    
    uniform float color_r;
    uniform float color_g;
    uniform float color_b;
    uniform float color_a;
    uniform float extend;
    uniform float radius;
    
    void main() {
      vec2 new_uv = v_texcoord * (1.0 - v_texcoord.yx);
      float vig = new_uv.x * new_uv.y * radius;
      vig = pow(vig, extend);
      gl_FragColor = mix(vec4(color_r,color_g,color_b,color_a), texture2D(u_texture, v_texcoord), vig);
    }
  `;
  var RadialBlurShaderCode = `
    precision mediump float;
    
    varying vec2 v_texcoord;
    varying vec4 vColor;
    uniform sampler2D u_texture;
    
    uniform float centerX;
    uniform float centerY;
    uniform float power;
    uniform float sampleCount;
    
    void main() {
      vec2 direction = v_texcoord - vec2(centerX, centerY);
      vec3 c = vec3(0.0);
      float f = 1.0 / sampleCount;
      for (float i = 0.0; i < 64.0; ++i) {
        if (i >= sampleCount) break;
        c += texture2D(u_texture, v_texcoord - power * direction * i).rgb * f;
      }
      gl_FragColor.rgb = c;
      gl_FragColor.a = 1.0;
    }
  `;
  var ChromaticShaderCode = `
    precision mediump float;
    
    varying vec2 v_texcoord;
    varying vec4 vColor;
    uniform sampler2D u_texture;
    
    uniform float power;
    uniform float sampleCount;
    
    void main() {
      vec3 sum = vec3(0.0);
      vec3 c = vec3(0.0);
      vec2 offset = (v_texcoord - vec2(0.5)) * vec2(1, -1);
      int sample_count = int(sampleCount);
      for (int i = 0; i < 4; ++i) {
        if (i >= sample_count) break;
        float t = 2.0 * float(i) / float(sample_count - 1);
        vec3 slice = vec3(1.0 - t, 1.0 - abs(t - 1.0), t - 1.0);
        slice = max(slice, 0.0);
        sum += slice;
        vec2 slice_offset = (t - 1.0) * power * offset;
        c += slice * texture2D(u_texture, v_texcoord + slice_offset).rgb;
      }
      gl_FragColor.rgb = c / sum;
      gl_FragColor.a = 1.0;
    }
  `;
  var FisheyeShaderCode = `
    precision mediump float;
    
    varying vec2 v_texcoord;
    varying vec4 vColor;
    uniform sampler2D u_texture;
    uniform vec2 screenSize;
    
    uniform float power;
    
    void main() {
      vec2 p = vec2(v_texcoord.x, v_texcoord.y * screenSize.y / screenSize.x);
      float aspect = screenSize.x / screenSize.y;
      vec2 m = vec2(0.5, 0.5 / aspect);
      vec2 d = p - m;
      float r = sqrt(dot(d, d));
      float new_power = (2.0 * 3.141592 / (2.0 * sqrt(dot(m, m)))) * power;
      float bind = new_power > 0.0? sqrt(dot(m, m)): (aspect < 1.0? m.x: m.y);
      vec2 nuv;
      if (new_power > 0.0)
        nuv = m + normalize(d) * tan(r * new_power) * bind / tan(bind * new_power);
      else
        nuv = m + normalize(d) * atan(r * -new_power * 10.0) * bind / atan(-new_power * bind * 10.0);
      gl_FragColor = texture2D(u_texture, vec2(nuv.x, nuv.y * aspect));
    }
  `;
  var PixelWarpShaderCode = `
    precision mediump float;
    
    varying vec2 v_texcoord;
    varying vec4 vColor;
    uniform sampler2D u_texture;
    
    uniform float time;
    uniform float power;
    uniform float rate;
    uniform float speed;
    uniform float blockCount;
    uniform float colorRate;
    uniform float angle; // degrees
  
    float my_trunc(float x) {
      return x < 0.0? -floor(-x): floor(x);
    }
  
    float random(float seed) {
      return fract(543.2543 * sin(dot(vec2(seed, seed), vec2(3525.46, -54.3415))));
    }
  
    void main() {
      float enable_shift = float(random(my_trunc(time * speed)) < rate);
      float a = radians(angle);
      vec2 D = vec2(cos(a), sin(a));           // displacement direction
      vec2 N = vec2(-sin(a), cos(a));          // stripe normal
      float stripeCoord = dot(v_texcoord, N);
      float blockIdx = my_trunc(stripeCoord * blockCount);
      float shiftAmount = (random((blockIdx / blockCount) + time) - 0.5) * power * enable_shift;
      vec2 fixed_uv = v_texcoord + D * shiftAmount;
      vec4 pixel_color = texture2D(u_texture, fixed_uv);
      pixel_color.r = mix(
        pixel_color.r,
        texture2D(u_texture, fixed_uv + D * colorRate).r,
        enable_shift
      );
      pixel_color.b = mix(
        pixel_color.b,
        texture2D(u_texture, fixed_uv - D * colorRate).b,
        enable_shift
      );
      gl_FragColor = pixel_color;
    }
  `;
  var WaveWarpShaderCode = `
    precision mediump float;
    
    varying vec2 v_texcoord;
    varying vec4 vColor;
    uniform sampler2D u_texture;
  
    uniform float amplitude;
    uniform float period;
    uniform float initialphase;
    
    float wave(float a) {
      if(sin(dot(vec2(a, a), vec2(a, a)) + initialphase) > 0.0){
        return fract(amplitude * abs(sin(dot(vec2(a, a), vec2(a, a)) + initialphase)));
      }else{
        return - fract(amplitude * abs(sin(dot(vec2(a, a), vec2(a, a)) + initialphase)));
      }
    }
  
    void main() {
      vec2 new_uv = v_texcoord;
      new_uv.x += wave(v_texcoord.y + period);
      gl_FragColor = texture2D(u_texture,new_uv);
    }
  `;
  function strAdd(str, char, string) {
    return `${str.slice(0, char) + string + str.slice(char)}`;
  }
  function getUniformLocation(gl, uname) {
    if (!drawprogram || !gl.isProgram(drawprogram)) {
      return null;
    }
    gl.useProgram(drawprogram);
    const cacheKey = drawprogram_mode + "_" + uname;
    if (uniformLocationBuffer[cacheKey] === undefined) {
      const loc = gl.getUniformLocation(drawprogram, uname);
      uniformLocationBuffer[cacheKey] = loc; // can be null
    }
    return uniformLocationBuffer[cacheKey];
  }
  // removed getClippingBox in v4
  function setUniform1f(gl, uname, value) {
    const loc = getUniformLocation(gl, uname);
    if (loc !== null) {
      gl.uniform1f(loc, value);
    }
  }
  function setUniform1i(gl, uname, value) {
    const loc = getUniformLocation(gl, uname);
    if (loc !== null) {
      gl.uniform1i(loc, value);
    }
  }
  function setUniform2fv(gl, uname, value1, value2) {
    const loc = getUniformLocation(gl, uname);
    if (loc !== null) {
      gl.uniform2fv(loc, [value1, value2]);
    }
  }

  // Helpers to set uniforms on a specific program without relying on drawprogram
  function setUniform1fOn(program, uname, value) {
    gl.useProgram(program);
    gl.uniform1f(gl.getUniformLocation(program, uname), value);
  }
  function setUniform2fvOn(program, uname, value1, value2) {
    gl.useProgram(program);
    gl.uniform2fv(gl.getUniformLocation(program, uname), [value1, value2]);
  }
  function setUniform3fvOn(program, uname, arr3) {
    gl.useProgram(program);
    gl.uniform3fv(gl.getUniformLocation(program, uname), arr3);
  }

  var quadPositionBuffer;

  var quadTexCoordBuffer;

  /*
        Since clippingblending duck punching gl.bindFramebuffer will stop
        working when using custom framebuffer,  no reason is known at the
        moment. Use this method to bypass the duck punching it to achieve 
        compatibility.
  
        https://github.com/TurboWarp/extensions/blob/master/extensions/Xeltalliv/clippingblending.js#L48
      */
  function ShaderIsBackGround(able) {
    SBG = able;
  }
  function bindFramebufferInfo(gl, framebufferInfo, target) {
      target = gl.DRAW_FRAMEBUFFER;
      var nativeBindFramebuffer = WebGL2RenderingContext.prototype.bindFramebuffer;
      nativeBindFramebuffer.call(gl,target,  framebufferInfo ? framebufferInfo.framebuffer : null);
  }
  function createFramebuffer(gl, attachments, width, height, target) {
    target = target || gl.FRAMEBUFFER;
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(target, framebuffer);
    attachments.forEach(function (attachment) {
      gl.framebufferTexture2D(
        target,
        attachment.attachment,
        attachment.texTarget,
        attachment.texture,
        attachment.level,
      );
    });
    const status = gl.checkFramebufferStatus(target);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      return null;
    }
    gl.bindFramebuffer(target, null);
    return {
      framebuffer: framebuffer,
      attachments: attachments,
      width: width,
      height: height,
    };
  }
  function createRenderTexture(gl, width, height) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }
  function createshader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) {
      return shader;
    }
    console.log(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
  }

  function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (success) {
      return program;
    }
    console.log(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
  }

  function initShader() {
    var programs = {
      none: null,
      glitch: null,
      dispersion: null,
      gray: null,
      reverse: null,
      pointillism: null,
      screensplit: null,
      mask: null,
      helleffectshader: null,
      vignetteshader: null,
      radialblurshader: null,
      chromaticshader: null,
      fisheyeshader: null,
      pixelwarpshader: null,
      wavewarpshader: null,
    };
    programs.none = createProgram(
      gl,
      createshader(gl, gl.VERTEX_SHADER, vertexShaderCode),
      createshader(gl, gl.FRAGMENT_SHADER, noneShaderCode),
    );
    programs.glitch = createProgram(
      gl,
      createshader(gl, gl.VERTEX_SHADER, vertexShaderCode),
      createshader(gl, gl.FRAGMENT_SHADER, GlitchShaderCode),
    );
    programs.dispersion = createProgram(
      gl,
      createshader(gl, gl.VERTEX_SHADER, vertexShaderCode),
      createshader(gl, gl.FRAGMENT_SHADER, dispersionShaderCode),
    );
    programs.gray = createProgram(
      gl,
      createshader(gl, gl.VERTEX_SHADER, vertexShaderCode),
      createshader(gl, gl.FRAGMENT_SHADER, GrayShaderCode),
    );
    programs.reverse = createProgram(
      gl,
      createshader(gl, gl.VERTEX_SHADER, vertexShaderCode),
      createshader(gl, gl.FRAGMENT_SHADER, ReverseShaderCode),
    );
    programs.pointillism = createProgram(
      gl,
      createshader(gl, gl.VERTEX_SHADER, vertexShaderCode),
      createshader(gl, gl.FRAGMENT_SHADER, PointillismShaderCode),
    );
    programs.screensplit = createProgram(
      gl,
      createshader(gl, gl.VERTEX_SHADER, vertexShaderCode),
      createshader(gl, gl.FRAGMENT_SHADER, screensplitShaderCode),
    );
    programs.helleffectshader = createProgram(
      gl,
      createshader(gl, gl.VERTEX_SHADER, vertexShaderCode),
      createshader(gl, gl.FRAGMENT_SHADER, HellShaderCode),
    );
    programs.vignetteshader = createProgram(
      gl,
      createshader(gl, gl.VERTEX_SHADER, vertexShaderCode),
      createshader(gl, gl.FRAGMENT_SHADER, VignetteShaderCode),
    );
    programs.radialblurshader = createProgram(
      gl,
      createshader(gl, gl.VERTEX_SHADER, vertexShaderCode),
      createshader(gl, gl.FRAGMENT_SHADER, RadialBlurShaderCode),
    );
    programs.chromaticshader = createProgram(
      gl,
      createshader(gl, gl.VERTEX_SHADER, vertexShaderCode),
      createshader(gl, gl.FRAGMENT_SHADER, ChromaticShaderCode),
    );
    programs.fisheyeshader = createProgram(
      gl,
      createshader(gl, gl.VERTEX_SHADER, vertexShaderCode),
      createshader(gl, gl.FRAGMENT_SHADER, FisheyeShaderCode),
    );
    programs.pixelwarpshader = createProgram(
      gl,
      createshader(gl, gl.VERTEX_SHADER, vertexShaderCode),
      createshader(gl, gl.FRAGMENT_SHADER, PixelWarpShaderCode),
    );
    programs.wavewarpshader = createProgram(
      gl,
      createshader(gl, gl.VERTEX_SHADER, vertexShaderCode),
      createshader(gl, gl.FRAGMENT_SHADER, WaveWarpShaderCode),
    );
    return programs;
  }
  function getProgramForEffectName(name) {
    switch (name) {
      case "glitch": return shaderPrograms.glitch;
      case "dispersion": return shaderPrograms.dispersion;
      case "gray": return shaderPrograms.gray;
      case "reverse": return shaderPrograms.reverse;
      case "pointillism": return shaderPrograms.pointillism;
      case "screensplit": return shaderPrograms.screensplit;
      case "helleffectshader": return shaderPrograms.helleffectshader;
      case "vignette": return shaderPrograms.vignetteshader;
      case "radialblur": return shaderPrograms.radialblurshader;
      case "chromatic": return shaderPrograms.chromaticshader;
      case "fisheye": return shaderPrograms.fisheyeshader;
      case "pixelwarp": return shaderPrograms.pixelwarpshader;
      case "wavewarp": return shaderPrograms.wavewarpshader;
      case "none": return shaderPrograms.none;
      default: return null;
    }
  }
  
  // Helper function to safely set uniforms with null checks
  function safeSetUniform(program, uname, uniformValue, uniformType) {
    const loc = gl.getUniformLocation(program, uname);
    if (loc === null) return;
    
    if (uniformType === "1f") {
      gl.uniform1f(loc, uniformValue);
    } else if (uniformType === "1i") {
      gl.uniform1i(loc, uniformValue);
    } else if (uniformType === "2fv") {
      gl.uniform2fv(loc, uniformValue);
    } else if (uniformType === "3fv") {
      gl.uniform3fv(loc, uniformValue);
    }
  }
  
  function initShaderUniform(programs) {
    gl.useProgram(programs.glitch);
    safeSetUniform(programs.glitch, "_BlockSize", [16, 16], "2fv");
    safeSetUniform(programs.glitch, "_Amplitude", 0.1, "1f");
    safeSetUniform(programs.glitch, "_Time", 0, "1f");
    safeSetUniform(programs.glitch, "_Rgb", 0, "1i");
    safeSetUniform(programs.glitch, "u_pos1", [0, 0], "2fv");
    safeSetUniform(programs.glitch, "u_pos2", [1, 1], "2fv");
    safeSetUniform(programs.glitch, "u_dir", [1, 1], "2fv");
    gl.useProgram(programs.pointillism);
    safeSetUniform(programs.pointillism, "u_size", 0.0001, "1f");
    safeSetUniform(programs.pointillism, "u_threshold", 0.7, "1f");
    safeSetUniform(programs.pointillism, "u_resolution", [gl.canvas.width, gl.canvas.height], "2fv");
    gl.useProgram(programs.dispersion);
    safeSetUniform(programs.dispersion, "direction_r", [1.0, 0.0], "2fv");
    safeSetUniform(programs.dispersion, "direction_g", [0.4, 1.0], "2fv");
    safeSetUniform(programs.dispersion, "direction_b", [-0.7, -0.3], "2fv");
    safeSetUniform(programs.dispersion, "_Amplitude", 0.01, "1f");
    gl.useProgram(programs.gray);
    safeSetUniform(programs.gray, "_color", [255, 255, 255], "3fv");
    gl.useProgram(programs.screensplit);
    safeSetUniform(programs.screensplit, "offset", [0, 0], "2fv");
    safeSetUniform(programs.screensplit, "split", [1, 1], "2fv");
    gl.useProgram(programs.helleffectshader);
    safeSetUniform(programs.helleffectshader, "eyes_alpha", 1, "1i");
    safeSetUniform(programs.helleffectshader, "timer", 0, "1i");
    gl.useProgram(programs.vignetteshader);
    safeSetUniform(programs.vignetteshader, "color_r", 0.0, "1f");
    safeSetUniform(programs.vignetteshader, "color_g", 0.0, "1f");
    safeSetUniform(programs.vignetteshader, "color_b", 0.0, "1f");
    safeSetUniform(programs.vignetteshader, "color_a", 1.0, "1f");
    safeSetUniform(programs.vignetteshader, "extend", 0.25, "1f");
    safeSetUniform(programs.vignetteshader, "radius", 15.0, "1f");
    gl.useProgram(programs.radialblurshader);
    safeSetUniform(programs.radialblurshader, "centerX", 0.5, "1f");
    safeSetUniform(programs.radialblurshader, "centerY", 0.5, "1f");
    safeSetUniform(programs.radialblurshader, "power", 0.01, "1f");
    safeSetUniform(programs.radialblurshader, "sampleCount", 3.0, "1f");
    gl.useProgram(programs.chromaticshader);
    safeSetUniform(programs.chromaticshader, "power", 0.01, "1f");
    safeSetUniform(programs.chromaticshader, "sampleCount", 3.0, "1f");
    gl.useProgram(programs.fisheyeshader);
    safeSetUniform(programs.fisheyeshader, "screenSize", [gl.canvas.width, gl.canvas.height], "2fv");
    safeSetUniform(programs.fisheyeshader, "power", -0.1, "1f");
    gl.useProgram(programs.pixelwarpshader);
    safeSetUniform(programs.pixelwarpshader, "time", 0.0, "1f");
    safeSetUniform(programs.pixelwarpshader, "power", 0.03, "1f");
    safeSetUniform(programs.pixelwarpshader, "rate", 1.0, "1f");
    safeSetUniform(programs.pixelwarpshader, "speed", 5.0, "1f");
    safeSetUniform(programs.pixelwarpshader, "blockCount", 30.5, "1f");
    safeSetUniform(programs.pixelwarpshader, "colorRate", 0.01, "1f");
    safeSetUniform(programs.pixelwarpshader, "angle", 0.0, "1f");
    gl.useProgram(programs.wavewarpshader);
    safeSetUniform(programs.wavewarpshader, "amplitude", 0.01, "1f");
    safeSetUniform(programs.wavewarpshader, "period", 11.4, "1f");
    safeSetUniform(programs.wavewarpshader, "initialphase", 0.0, "1f");
  }

  var uniformLocationBuffer = {};

  var drawframebuffer = null;
  var framebuffersize = {
    Width: 0,
    Height: 0,
  };

  var framebuffertexture = null;
  var shaderPrograms = initShader();
  var drawprogram = shaderPrograms.none;
  var drawprogram_mode = "none";
  var bgprogram = shaderPrograms.none;
  var pipelineEffects = [];
  var pipelineTexA = null;
  var pipelineTexB = null;
  var pipelineFboA = null;
  var pipelineFboB = null;
  var pipelinePassParams = [];
  var pipelineTargetIndex = 0;
  function ensurePipelineIndex(i) {
    while (pipelineEffects.length <= i) {
      pipelineEffects.push("none");
      pipelinePassParams.push({ __enabled: true });
    }
  }
  function setPipelineEffectAt(i, name) {
    ensurePipelineIndex(i);
    pipelineEffects[i] = name;
    pipelinePassParams[i] = { __enabled: true };
  }
  function setPassParam(i, key, value) {
    ensurePipelineIndex(i);
    if (!pipelinePassParams[i]) pipelinePassParams[i] = {};
    pipelinePassParams[i][key] = value;
  }
  var positionLocation = gl.getAttribLocation(drawprogram, "a_position");
  var texcoordLocation = gl.getAttribLocation(drawprogram, "a_texcoord");
  var textureLocation = gl.getUniformLocation(drawprogram, "u_texture");
  initShaderUniform(shaderPrograms);
  gl.useProgram(drawprogram);
  if (textureLocation !== null) {
    gl.uniform1i(textureLocation, 0);
  }

  const GS = renderer._shaderManager.getShader;
  //check framebuffer & buffer status
  const rendererDrawPrefix = function () {
    if (framebuffertexture == null) {
      framebuffertexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, framebuffertexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.canvas.width,
        gl.canvas.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
      framebuffersize.Width = gl.canvas.width;
      framebuffersize.Height = gl.canvas.height;
    }
    if (
      framebuffersize.Height != gl.canvas.height ||
      framebuffersize.Width != gl.canvas.width
    ) {
      updateFrameBuffer(gl.canvas.width, gl.canvas.height);
      framebuffersize.Width = gl.canvas.width;
      framebuffersize.Height = gl.canvas.height;
    }
    if (quadTexCoordBuffer == null) {
      quadTexCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadTexCoordBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(quadCoords),
        gl.STATIC_DRAW,
      );
    }
    if (quadPositionBuffer == null) {
      quadPositionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadPositionBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(quadPositions),
        gl.STATIC_DRAW,
      );
    }
    if (drawframebuffer == null) {
      drawframebuffer = createFramebuffer(
        gl,
        [
          {
            attachment: gl.COLOR_ATTACHMENT0,
            texTarget: gl.TEXTURE_2D,
            texture: framebuffertexture,
            level: 0,
          },
        ],
        canvas.width,
        canvas.height,
      );
    }
  }.bind(renderer);
  function createRenderTexture(gl, width, height) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }
  function getProgramForEffectName(name) {
    switch (name) {
      case "glitch": return shaderPrograms.glitch;
      case "dispersion": return shaderPrograms.dispersion;
      case "gray": return shaderPrograms.gray;
      case "reverse": return shaderPrograms.reverse;
      case "pointillism": return shaderPrograms.pointillism;
      case "screensplit": return shaderPrograms.screensplit;
      case "helleffectshader": return shaderPrograms.helleffectshader;
      case "vignette": return shaderPrograms.vignetteshader;
      case "radialblur": return shaderPrograms.radialblurshader;
      case "chromatic": return shaderPrograms.chromaticshader;
      case "fisheye": return shaderPrograms.fisheyeshader;
      case "pixelwarp": return shaderPrograms.pixelwarpshader;
      case "wavewarp": return shaderPrograms.wavewarpshader;
      // 'none' and 'pipeline' are not actual effects to run in a pass
      default: return null;
    }
  }
  function updatePipelineUniforms(passIndex, name, program) {
    // Ensure program is active when this is called
    try {
      const pparams = pipelinePassParams[passIndex] || {};
      const freeze = !!pparams.__freezeTime;
      switch (name) {
        case "glitch": {
          const loc = gl.getUniformLocation(program, "_Time");
          if (loc) {
            let t = pparams.__time;
            if (!freeze) {
              t = Math.random();
              if (!pipelinePassParams[passIndex]) pipelinePassParams[passIndex] = { __enabled: true };
              pipelinePassParams[passIndex].__time = t;
            } else if (t === undefined) {
              // Initialize once if paused without prior value
              t = Math.random();
              if (!pipelinePassParams[passIndex]) pipelinePassParams[passIndex] = { __enabled: true };
              pipelinePassParams[passIndex].__time = t;
            }
            gl.uniform1f(loc, t);
          }
          break;
        }
        case "pixelwarp": {
          const loc = gl.getUniformLocation(program, "time");
          if (loc) {
            let t = pparams.__time;
            if (!freeze) {
              t = performance.now() / 1000.0;
              if (!pipelinePassParams[passIndex]) pipelinePassParams[passIndex] = { __enabled: true };
              pipelinePassParams[passIndex].__time = t;
            } else if (t === undefined) {
              // Initialize once if paused without prior value
              t = performance.now() / 1000.0;
              if (!pipelinePassParams[passIndex]) pipelinePassParams[passIndex] = { __enabled: true };
              pipelinePassParams[passIndex].__time = t;
            }
            gl.uniform1f(loc, t);
          }
          break;
        }
        case "pointillism": {
          const loc = gl.getUniformLocation(program, "u_resolution");
          if (loc) gl.uniform2fv(loc, [gl.canvas.width, gl.canvas.height]);
          break;
        }
        default:
          break;
      }
    } catch (e) {
      // ignore uniform update errors for pipeline passes
    }
  }
  function normalizeModeName(s) {
    const pairs = [
      ["glitch", "PostProcess_glitch", "glitch"],
      ["dispersion", "PostProcess_dispersion", "dispersion"],
      ["gray", "PostProcess_gray", "gray"],
      ["reverse", "PostProcess_reverse", "reverse"],
      ["pointillism", "PostProcess_pointillism", "pointillism"],
      ["screensplit", "PostProcess_screensplit", "screensplit"],
      ["helleffectshader", "PostProcess_helleffectshader", "helleffectshader"],
      ["vignette", "PostProcess_vignette", "vignette"],
      ["radialblur", "PostProcess_radialblur", "radialblur"],
      ["chromatic", "PostProcess_chromatic", "chromatic"],
      ["fisheye", "PostProcess_fisheye", "fisheye"],
      ["pixelwarp", "PostProcess_pixelwarp", "pixelwarp"],
      ["wavewarp", "PostProcess_wavewarp", "wavewarp"],
      ["pipeline", "PostProcess_pipeline", "pipeline"],
      ["none", "PostProcess_none", "none"],
    ];
    for (let i = 0; i < pairs.length; i++) {
      const key = pairs[i][0];
      const id = pairs[i][1];
      const defv = pairs[i][2];
      const translated = Scratch.translate({ id: id, default: defv });
      if (s === key || s === translated) return key;
    }
    return s;
  }
  function ensurePipelineTargets() {
    if (pipelineTexA == null || pipelineTexB == null || pipelineFboA == null || pipelineFboB == null) {
      pipelineTexA = createRenderTexture(gl, gl.canvas.width, gl.canvas.height);
      pipelineTexB = createRenderTexture(gl, gl.canvas.width, gl.canvas.height);
      pipelineFboA = createFramebuffer(
        gl,
        [
          {
            attachment: gl.COLOR_ATTACHMENT0,
            texTarget: gl.TEXTURE_2D,
            texture: pipelineTexA,
            level: 0,
          },
        ],
        gl.canvas.width,
        gl.canvas.height,
      );
      pipelineFboB = createFramebuffer(
        gl,
        [
          {
            attachment: gl.COLOR_ATTACHMENT0,
            texTarget: gl.TEXTURE_2D,
            texture: pipelineTexB,
            level: 0,
          },
        ],
        gl.canvas.width,
        gl.canvas.height,
      );
    }
  }
  //draw framebuffer texture in screen
  const rendererDrawPostfix = function () {
    timeUniform();
    bindFramebufferInfo(gl, null); //modified
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(...this._backgroundColor4f);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindTexture(gl.TEXTURE_2D, framebuffertexture);
    if (drawprogram_mode === "pipeline" && pipelineEffects.length > 0) {
      ensurePipelineTargets();
      let srcTex = framebuffertexture;
      let dstFbo = pipelineFboA;
      for (let i = 0; i < pipelineEffects.length; ++i) {
        const name = pipelineEffects[i];
        const program = getProgramForEffectName(name);
        if (!program) continue;
        const pparams = pipelinePassParams[i];
        if (pparams && pparams.__enabled === false) continue; // paused layer
        bindFramebufferInfo(gl, dstFbo);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.useProgram(program);
        let pLoc = gl.getAttribLocation(program, "a_position");
        let tLoc = gl.getAttribLocation(program, "a_texcoord");
        let sLoc = gl.getUniformLocation(program, "u_texture");
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, srcTex);
        gl.uniform1i(sLoc, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadPositionBuffer);
        gl.enableVertexAttribArray(pLoc);
        gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadTexCoordBuffer);
        gl.enableVertexAttribArray(tLoc);
        gl.vertexAttribPointer(tLoc, 2, gl.FLOAT, false, 0, 0);
        updatePipelineUniforms(i, name, program);
        applyPipelinePassParams(i, name, program);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        // swap ping-pong
        if (dstFbo === pipelineFboA) {
          srcTex = pipelineTexA;
          dstFbo = pipelineFboB;
        } else {
          srcTex = pipelineTexB;
          dstFbo = pipelineFboA;
        }
      }
      // final blit to screen
      bindFramebufferInfo(gl, null);
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      const finalProgram = shaderPrograms.none;
      gl.useProgram(finalProgram);
      let pLoc = gl.getAttribLocation(finalProgram, "a_position");
      let tLoc = gl.getAttribLocation(finalProgram, "a_texcoord");
      let sLoc = gl.getUniformLocation(finalProgram, "u_texture");
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(sLoc, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadPositionBuffer);
      gl.enableVertexAttribArray(pLoc);
      gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadTexCoordBuffer);
      gl.enableVertexAttribArray(tLoc);
      gl.vertexAttribPointer(tLoc, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return;
    }
    // single-pass path
    positionLocation = gl.getAttribLocation(drawprogram, "a_position");
    texcoordLocation = gl.getAttribLocation(drawprogram, "a_texcoord");
    textureLocation = gl.getUniformLocation(drawprogram, "u_texture");
    gl.useProgram(drawprogram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, framebuffertexture);
    if (textureLocation !== null) {
      gl.uniform1i(textureLocation, 0);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, quadPositionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadTexCoordBuffer);
    gl.enableVertexAttribArray(texcoordLocation);
    gl.vertexAttribPointer(texcoordLocation, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }.bind(renderer);
  const rendererDrawBGPostfix = function () {
    timeUniform();
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(...this._backgroundColor4f);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindTexture(gl.TEXTURE_2D, framebuffertexture);

    gl.useProgram(bgprogram);
    positionLocation = gl.getAttribLocation(bgprogram, "a_position");
    texcoordLocation = gl.getAttribLocation(bgprogram, "a_texcoord");
    textureLocation = gl.getUniformLocation(bgprogram, "u_texture");
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, framebuffertexture);
    gl.uniform1i(textureLocation, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadPositionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadTexCoordBuffer);
    gl.enableVertexAttribArray(texcoordLocation);
    gl.vertexAttribPointer(texcoordLocation, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }.bind(renderer);

  const draw = function () {
    if (!this.dirty) {
      return;
    }
    this.dirty = false;

    bindFramebufferInfo(gl, null);

    rendererDrawPrefix(); //append

    bindFramebufferInfo(gl, drawframebuffer); //modified

    this._doExitDrawRegion();
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    rendererDrawBGPostfix();
    this._drawThese(this._drawList, "default", this._projection, {
      // draw the sprite to framebuffer
      framebufferWidth: gl.canvas.width,
      framebufferHeight: gl.canvas.height,
    });
    if (this._snapshotCallbacks.length > 0) {
      const snapshot = gl.canvas.toDataURL();
      this._snapshotCallbacks.forEach((cb) => cb(snapshot));
      this._snapshotCallbacks = [];
    }
    rendererDrawPostfix(); //append
  }.bind(renderer);

  const postProcessingDraw_local = draw;
  postProcessingDraw = draw;  // Save globally so PostAIO doesn't overwrite it
  renderer.draw = draw;
  vm.runtime.on("PROJECT_LOADED", (_) => {
    rendererDrawPrefix();
  });

  //resize framebuffer when stage size changed
  vm.runtime.on("STAGE_SIZE_CHANGED", (_) => updateFrameBuffer());
  function updateFrameBuffer() {
    if (framebuffertexture != null) {
      console.log("STAGE_SIZE_CHANGED. resize the post-process framebuffer.");
      gl.bindTexture(gl.TEXTURE_2D, framebuffertexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.canvas.width,
        gl.canvas.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      if (drawprogram_mode == "pointillism") {
        setUniform2fv(gl, "u_resolution", gl.canvas.width, gl.canvas.height);
      }
      // Keep pointillism resolution in sync for pipeline usage too
      if (shaderPrograms && shaderPrograms.pointillism) {
        gl.useProgram(shaderPrograms.pointillism);
        gl.uniform2fv(
          gl.getUniformLocation(shaderPrograms.pointillism, "u_resolution"),
          [gl.canvas.width, gl.canvas.height],
        );
      }
      if (shaderPrograms && shaderPrograms.fisheyeshader) {
        // keep fisheye screenSize in sync with canvas size
        gl.useProgram(shaderPrograms.fisheyeshader);
        gl.uniform2fv(
          gl.getUniformLocation(shaderPrograms.fisheyeshader, "screenSize"),
          [gl.canvas.width, gl.canvas.height],
        );
      }
      // Reallocate pipeline ping-pong textures to new size
      if (pipelineTexA) {
        gl.bindTexture(gl.TEXTURE_2D, pipelineTexA);
        gl.texImage2D(
          gl.TEXTURE_2D, 0, gl.RGBA,
          gl.canvas.width, gl.canvas.height,
          0, gl.RGBA, gl.UNSIGNED_BYTE, null
        );
      }
      if (pipelineTexB) {
        gl.bindTexture(gl.TEXTURE_2D, pipelineTexB);
        gl.texImage2D(
          gl.TEXTURE_2D, 0, gl.RGBA,
          gl.canvas.width, gl.canvas.height,
          0, gl.RGBA, gl.UNSIGNED_BYTE, null
        );
      }
    }
  }
  vm.runtime.on("PROJECT_RUN_START", (_) => {
    positionLocation = gl.getAttribLocation(drawprogram, "a_position");
    texcoordLocation = gl.getAttribLocation(drawprogram, "a_texcoord");
    textureLocation = gl.getUniformLocation(drawprogram, "u_texture");
  });
  var timeruniform = true;
  function timeUniform() {
    if (!timeruniform) return;
    switch (drawprogram_mode) {
      case "glitch":
        gl.useProgram(drawprogram);
        setUniform1f(gl, "_Time", Math.random());
        break;
      case "pixelwarp":
        gl.useProgram(drawprogram);
        setUniform1f(gl, "time", performance.now() / 1000.0);
        break;
    }
  }
  class postprocessing {
    getInfo() {
      return {
        id: "postprocessingv2",
        name: "Post-Processing V2",
        blocks: [
          {
            blockType: Scratch.BlockType.XML,
            xml: `<sep gap="12"/><label text="${Scratch.translate("Post-processing")}"/><sep gap="12"/>`,
          },
          {
            opcode: "opcodeChangePostProcess",
            text: Scratch.translate({ id: 'opcodeChangePostProcess', default: "change effect to [Menu]"}),
            blockType: Scratch.BlockType.COMMAND,
            arguments: {
              Menu: {
                type: Scratch.ArgumentType.STRING,
                menu: "PostProcess",
              },
            },
          },
          {
            opcode: "opcodeChangeGlitch",
            text: Scratch.translate({ id: 'opcodeChangeGlitch', default: "Glitch Amplitude:[Amplitude]%,"}),
            blockType: Scratch.BlockType.COMMAND,
            arguments: {
              Amplitude: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1,
              },
            },
          },
          {
            opcode: "opcodeChangeDispersion",
            text: Scratch.translate({ id: 'opcodeChangeDispersion', default: "Dispersion Amplitude:[Amplitude]%"}),
            blockType: Scratch.BlockType.COMMAND,
            arguments: {
              Amplitude: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1,
              },
            },
          },
          {
            opcode: "opcodeChangeGray",
            text: Scratch.translate({ id: 'opcodeChangeGray', default: "Gray Color:[COLOR]"}),
            blockType: Scratch.BlockType.COMMAND,
            arguments: {
              COLOR: {
                type: Scratch.ArgumentType.COLOR,
                defaultValue: "#FFFFFF",
              },
            },
          },
          {
            opcode: "opcodeChangePointillism",
            text: Scratch.translate({ id: 'opcodeChangePointillism', default: "Pointillism Threshold:[threshold]%"}),
            blockType: Scratch.BlockType.COMMAND,
            arguments: {
              threshold: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 70,
              },
            },
          },
          {
            opcode: "opcodeChangeScreensplit",
            text: Scratch.translate({ id: 'opcodeChangeScreensplit', default: "Screensplit x:[split_x] y:[split_y]"}),
            blockType: Scratch.BlockType.COMMAND,
            arguments: {
              split_x: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1,
              },
              split_y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1,
              },
            },
          },
          {
            opcode: "opcodeChangeVignette",
            text: Scratch.translate({ id: 'opcodeChangeVignette', default: "Vignette r:[v_color_r] g:[v_color_g] b:[v_color_b] a:[v_color_a] extend:[v_extend] radius:[v_radius]"}),
            blockType: Scratch.BlockType.COMMAND,
            arguments: {
              v_color_r: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              v_color_g: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              v_color_b: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              v_color_a: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
              v_extend: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.25 },
              v_radius: { type: Scratch.ArgumentType.NUMBER, defaultValue: 15 },
            },
          },
          {
            opcode: "opcodeChangeRadialBlur",
            text: Scratch.translate({ id: 'opcodeChangeRadialBlur', default: "Radial blur centerX:[rb_X] centerY:[rb_Y] power:[rb_power] samples:[rb_samplecount]"}),
            blockType: Scratch.BlockType.COMMAND,
            arguments: {
              rb_X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.5 },
              rb_Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.5 },
              rb_power: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.01 },
              rb_samplecount: { type: Scratch.ArgumentType.NUMBER, defaultValue: 3 },
            },
          },
          {
            opcode: "opcodeChangeChromatic",
            text: Scratch.translate({ id: 'opcodeChangeChromatic', default: "Chromatic power:[c_power] samples:[c_samplecount]"}),
            blockType: Scratch.BlockType.COMMAND,
            arguments: {
              c_power: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.01 },
              c_samplecount: { type: Scratch.ArgumentType.NUMBER, defaultValue: 3 },
            },
          },
          {
            opcode: "opcodeChangeFisheye",
            text: Scratch.translate({ id: 'opcodeChangeFisheye', default: "Fisheye power:[f_power]"}),
            blockType: Scratch.BlockType.COMMAND,
            arguments: {
              f_power: { type: Scratch.ArgumentType.NUMBER, defaultValue: -0.1 },
            },
          },
          {
            opcode: "opcodeChangePixelWarp",
            text: Scratch.translate({ id: 'opcodeChangePixelWarp', default: "Pixel warp power:[pw_power] blocks:[pw_blockcount] colorRate:[pw_colorrate] angle:[pw_angle]"}),
            blockType: Scratch.BlockType.COMMAND,
            arguments: {
              pw_power: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.03 },
              pw_blockcount: { type: Scratch.ArgumentType.NUMBER, defaultValue: 30.5 },
              pw_colorrate: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.01 },
              pw_angle: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
            },
          },
          {
            opcode: "opcodeChangeWaveWarp",
            text: Scratch.translate({ id: 'opcodeChangeWaveWarp', default: "Wave warp amplitude:[ww_amplitude] period:[ww_period] initialphase:[ww_initialphase]"}),
            blockType: Scratch.BlockType.COMMAND,
            arguments: {
              ww_amplitude: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.01 },
              ww_period: { type: Scratch.ArgumentType.NUMBER, defaultValue: 11.4 },
              ww_initialphase: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.0 },
            },
          },

          // Pipeline controls
          {
            opcode: "opcodePipelineAdd",
            text: Scratch.translate({ id: 'opcodePipelineAdd', default: "Pipeline add [Menu]"}),
            blockType: Scratch.BlockType.COMMAND,
            arguments: {
              Menu: {
                type: Scratch.ArgumentType.STRING,
                menu: "PostProcess",
              },
            },
          },
          {
            opcode: "opcodePipelineClear",
            text: Scratch.translate({ id: 'opcodePipelineClear', default: "Pipeline clear"}),
            blockType: Scratch.BlockType.COMMAND,
            arguments: {},
          },
          {
            opcode: "opcodeGetPipeline",
            text: Scratch.translate({ id: 'opcodeGetPipeline', default: "Pipeline list"}),
            blockType: Scratch.BlockType.REPORTER,
            arguments: {},
          },
          {
            opcode: "opcodePipelineSetTargetIndex",
            text: Scratch.translate({ id: 'opcodePipelineSetTargetIndex', default: "Pipeline set target index [index]"}),
            blockType: Scratch.BlockType.COMMAND,
            arguments: {
              index: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
            },
          },
          {
            opcode: "opcodePipelineSetTargetPaused",
            text: Scratch.translate({ id: 'opcodePipelineSetTargetPaused', default: "Pipeline freeze target time [paused]"}),
            blockType: Scratch.BlockType.COMMAND,
            arguments: {
              paused: { type: Scratch.ArgumentType.BOOLEAN, defaultValue: true },
            },
          },

          {
            opcode: "opcodeRequestReDraw",
            text: Scratch.translate({ id: 'opcodeRequestReDraw', default: "redraw post-process"}),
            blockType: Scratch.BlockType.COMMAND,
            arguments: {},
          },
          {
            opcode: "opcodeGetPostProcess",
            color1: "#a772e7",
            text: Scratch.translate({ id: 'opcodeGetPostProcess', default: "Post-Process Mode"}),
            blockType: Scratch.BlockType.REPORTER,
            arguments: {},
          },

          {
            opcode: "opcodeUniform2fv",
            color1: "#a772e7",
            text: "uniform2fv Name:[NAME] Value:[X] [Y]",
            blockType: Scratch.BlockType.COMMAND,
            arguments: {
              NAME: {
                type: Scratch.ArgumentType.STRING,
                menu: "v2_uniforms",
              },
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 8,
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 8,
              },
            },
            hideFromPalette: false,
          },
          //THEY BLOCKS WAS VERY DANGEROUS, SHOULDN'T BE USED BY NORMAL USERS. JUST FOR THE PRO.
          {
            opcode: "opcodeUniform1f",
            color1: "#a772e7",
            text: "uniform1f Name:[NAME] Value:[X]",
            blockType: Scratch.BlockType.COMMAND,
            arguments: {
              NAME: {
                type: Scratch.ArgumentType.STRING,
                menu: "v1_uniforms",
              },
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0,
              },
            },
            hideFromPalette: false,
          },
          {
            opcode: "opcodeReplaceShader",
            color1: "#a772e7",
            text: "post-process VS:[VS] FS:[FS]",
            blockType: Scratch.BlockType.COMMAND,
            arguments: {
              VS: {
                type: Scratch.ArgumentType.STRING,
                defaultValue:
                  "attribute vec4 a_position;attribute vec2 a_texcoord;varying vec2 v_texcoord;void main() {gl_Position = vec4(a_position.x, a_position.y, a_position.z, 1);v_texcoord = a_texcoord;}",
              },
              FS: {
                type: Scratch.ArgumentType.STRING,
                defaultValue:
                  "varying vec2 v_texcoord;varying vec4 vColor;uniform sampler2D u_texture;void main() {gl_FragColor=texture2D(u_texture,v_texcoord);}",
              },
            },
            hideFromPalette: false,
          },
        ],
        menus: {
          PostProcess: {
            acceptReporters: true,
            items: [
              Scratch.translate({ id: 'PostProcess_glitch', default: "glitch"}),
              Scratch.translate({ id: 'PostProcess_dispersion', default: "dispersion"}),
              Scratch.translate({ id: 'PostProcess_gray', default: "gray"}),
              Scratch.translate({ id: 'PostProcess_reverse', default: "reverse"}),
              Scratch.translate({ id: 'PostProcess_pointillism', default: "pointillism"}),
              Scratch.translate({ id: 'PostProcess_screensplit', default: "screensplit"}),
              Scratch.translate({ id: 'PostProcess_helleffectshader', default: "helleffectshader"}),
              Scratch.translate({ id: 'PostProcess_vignette', default: "vignette"}),
              Scratch.translate({ id: 'PostProcess_radialblur', default: "radialblur"}),
              Scratch.translate({ id: 'PostProcess_chromatic', default: "chromatic"}),
              Scratch.translate({ id: 'PostProcess_fisheye', default: "fisheye"}),
              Scratch.translate({ id: 'PostProcess_pixelwarp', default: "pixelwarp"}),
              Scratch.translate({ id: 'PostProcess_wavewarp', default: "wavewarp"}),
              Scratch.translate({ id: 'PostProcess_pipeline', default: "pipeline"}),
              Scratch.translate({ id: 'PostProcess_none', default: "none"}),
            ],
          },
          v1_uniforms: {
            acceptReporters: true,
            items: [
              "dispersion._Amplitude",
              "dispersion._Time",
              "pointillism.u_size",
              "pointillism.u_threshold",
              "glitch._Amplitude",
              "glitch._Time",
              "glitch._Rgb",
              "hell.timer",
              "hell.eyes_alpha",
              "vignette.color_a",
              "vignette.color_r",
              "vignette.color_g",
              "vignette.color_b",
              "vignette.extend",
              "vignette.radius",
              "radialblur.centerX",
              "radialblur.centerY",
              "radialblur.power",
              "radialblur.sampleCount",
              "chromatic.power",
              "chromatic.sampleCount",
              "fisheye.power",
              "pixelwarp.time",
              "pixelwarp.power",
              "pixelwarp.rate",
              "pixelwarp.speed",
              "pixelwarp.blockCount",
              "pixelwarp.colorRate",
              "pixelwarp.angle",
              "wavewarp.amplitude",
              "wavewarp.period",
              "wavewarp.initialphase",
            ],
          },
          v2_uniforms: {
            acceptReporters: true,
            items: [
              "glitch._BlockSize",
              "dispersion.direction_r",
              "dispersion.direction_g",
              "dispersion.direction_b",
              "screensplit.offset",
              "screensplit.split",
              "fisheye.screenSize",
            ],
          },
        },
      };
    }

    opcodeChangePostProcess({ Menu }) {
      // Global pipeline mode: this block sets the effect at the target index
      const key = normalizeModeName(Scratch.Cast.toString(Menu));
      if (key === "pipeline") {
        drawprogram_mode = "pipeline";
      } else if (key === "none") {
        setPipelineEffectAt(pipelineTargetIndex, "none");
      } else {
        const prog = getProgramForEffectName(key);
        if (prog) setPipelineEffectAt(pipelineTargetIndex, key);
      }
      drawprogram_mode = "pipeline";
      vm.runtime.requestRedraw();
      vm.renderer.dirty = true;
    }
    opcodeChangeDispersion({ Amplitude }) {
      setPipelineEffectAt(pipelineTargetIndex, "dispersion");
      setPassParam(pipelineTargetIndex, "_Amplitude", Scratch.Cast.toNumber(Amplitude) / 100.0);
      drawprogram_mode = "pipeline";
      vm.runtime.requestRedraw();
      vm.renderer.dirty = true;
    }

    opcodeChangeGlitch({ Amplitude }) {
      setPipelineEffectAt(pipelineTargetIndex, "glitch");
      setPassParam(pipelineTargetIndex, "_Amplitude", Scratch.Cast.toNumber(Amplitude) / 100.0);
      drawprogram_mode = "pipeline";
      vm.runtime.requestRedraw();
      vm.renderer.dirty = true;
    }
    opcodeChangeGray({ COLOR }) {
      setPipelineEffectAt(pipelineTargetIndex, "gray");
      setPassParam(pipelineTargetIndex, "_color", Scratch.Cast.toRgbColorList(COLOR));
      drawprogram_mode = "pipeline";
      vm.runtime.requestRedraw();
      vm.renderer.dirty = true;
    }
    opcodeChangePointillism({ threshold }) {
      setPipelineEffectAt(pipelineTargetIndex, "pointillism");
      setPassParam(pipelineTargetIndex, "u_threshold", Scratch.Cast.toNumber(threshold) / 100.0);
      drawprogram_mode = "pipeline";
      vm.runtime.requestRedraw();
      vm.renderer.dirty = true;
    }
    opcodeChangeScreensplit({ split_x, split_y }) {
      setPipelineEffectAt(pipelineTargetIndex, "screensplit");
      setPassParam(pipelineTargetIndex, "split", [Scratch.Cast.toNumber(split_x), Scratch.Cast.toNumber(split_y)]);
      drawprogram_mode = "pipeline";
      vm.runtime.requestRedraw();
      vm.renderer.dirty = true;
    }
    opcodeChangeVignette({ v_color_r, v_color_g, v_color_b, v_color_a, v_extend, v_radius }) {
      setPipelineEffectAt(pipelineTargetIndex, "vignette");
      setPassParam(pipelineTargetIndex, "color_r", Scratch.Cast.toNumber(v_color_r) / 255.0);
      setPassParam(pipelineTargetIndex, "color_g", Scratch.Cast.toNumber(v_color_g) / 255.0);
      setPassParam(pipelineTargetIndex, "color_b", Scratch.Cast.toNumber(v_color_b) / 255.0);
      setPassParam(pipelineTargetIndex, "color_a", Scratch.Cast.toNumber(v_color_a));
      setPassParam(pipelineTargetIndex, "extend", Scratch.Cast.toNumber(v_extend));
      setPassParam(pipelineTargetIndex, "radius", Scratch.Cast.toNumber(v_radius));
      drawprogram_mode = "pipeline";
      vm.runtime.requestRedraw();
      vm.renderer.dirty = true;
    }
    opcodeChangeRadialBlur({ rb_X, rb_Y, rb_power, rb_samplecount }) {
      setPipelineEffectAt(pipelineTargetIndex, "radialblur");
      setPassParam(pipelineTargetIndex, "centerX", Scratch.Cast.toNumber(rb_X));
      setPassParam(pipelineTargetIndex, "centerY", Scratch.Cast.toNumber(rb_Y));
      setPassParam(pipelineTargetIndex, "power", Scratch.Cast.toNumber(rb_power));
      setPassParam(pipelineTargetIndex, "sampleCount", Scratch.Cast.toNumber(rb_samplecount));
      drawprogram_mode = "pipeline";
      vm.runtime.requestRedraw();
      vm.renderer.dirty = true;
    }
    opcodeChangeChromatic({ c_power, c_samplecount }) {
      setPipelineEffectAt(pipelineTargetIndex, "chromatic");
      setPassParam(pipelineTargetIndex, "power", Scratch.Cast.toNumber(c_power));
      setPassParam(pipelineTargetIndex, "sampleCount", Scratch.Cast.toNumber(c_samplecount));
      drawprogram_mode = "pipeline";
      vm.runtime.requestRedraw();
      vm.renderer.dirty = true;
    }
    opcodeChangeFisheye({ f_power }) {
      setPipelineEffectAt(pipelineTargetIndex, "fisheye");
      setPassParam(pipelineTargetIndex, "power", Scratch.Cast.toNumber(f_power));
      drawprogram_mode = "pipeline";
      vm.runtime.requestRedraw();
      vm.renderer.dirty = true;
    }
    opcodeChangePixelWarp({ pw_power, pw_blockcount, pw_colorrate, pw_angle }) {
      setPipelineEffectAt(pipelineTargetIndex, "pixelwarp");
      setPassParam(pipelineTargetIndex, "power", Scratch.Cast.toNumber(pw_power));
      setPassParam(pipelineTargetIndex, "blockCount", Scratch.Cast.toNumber(pw_blockcount));
      setPassParam(pipelineTargetIndex, "colorRate", Scratch.Cast.toNumber(pw_colorrate));
      setPassParam(pipelineTargetIndex, "angle", Scratch.Cast.toNumber(pw_angle));
      drawprogram_mode = "pipeline";
      vm.runtime.requestRedraw();
      vm.renderer.dirty = true;
    }
    opcodeChangeWaveWarp({ ww_amplitude, ww_period, ww_initialphase }) {
      setPipelineEffectAt(pipelineTargetIndex, "wavewarp");
      setPassParam(pipelineTargetIndex, "amplitude", Scratch.Cast.toNumber(ww_amplitude));
      setPassParam(pipelineTargetIndex, "period", Scratch.Cast.toNumber(ww_period));
      setPassParam(pipelineTargetIndex, "initialphase", Scratch.Cast.toNumber(ww_initialphase));
      drawprogram_mode = "pipeline";
      vm.runtime.requestRedraw();
      vm.renderer.dirty = true;
    }
    // Pipeline opcodes
    opcodePipelineSetTargetIndex({ index }) {
      const idx = Math.max(0, Math.floor(Scratch.Cast.toNumber(index)));
      pipelineTargetIndex = idx;
      ensurePipelineIndex(pipelineTargetIndex);
      drawprogram_mode = "pipeline";
      vm.runtime.requestRedraw();
      vm.renderer.dirty = true;
    }
    opcodePipelineSetTargetPaused({ paused }) {
      // Interpret "paused" as freeze shader time for the target layer
      ensurePipelineIndex(pipelineTargetIndex);
      if (!pipelinePassParams[pipelineTargetIndex]) pipelinePassParams[pipelineTargetIndex] = { __enabled: true };
      const freeze = Scratch.Cast.toBoolean(paused);
      pipelinePassParams[pipelineTargetIndex].__freezeTime = freeze;
      // Make sure layer stays enabled; we are freezing time, not disabling the pass
      if (pipelinePassParams[pipelineTargetIndex].__enabled === false) {
        pipelinePassParams[pipelineTargetIndex].__enabled = true;
      }
      drawprogram_mode = "pipeline";
      vm.runtime.requestRedraw();
      vm.renderer.dirty = true;
    }
    opcodePipelineAdd({ Menu }) {
      // switch to pipeline mode and push a valid effect
      const key = normalizeModeName(Scratch.Cast.toString(Menu));
      if (key === "pipeline" || key === "none" || !key) {
        // ignore non-effect entries
      } else {
        // only add if supported
        const prog = getProgramForEffectName(key);
        if (prog) {
          pipelineEffects.push(key);
          pipelinePassParams.push({});
        }
      }
      drawprogram_mode = "pipeline";
      vm.runtime.requestRedraw();
      vm.renderer.dirty = true;
    }
    opcodePipelineClear() {
      pipelineEffects = [];
      pipelinePassParams = [];
      vm.runtime.requestRedraw();
      vm.renderer.dirty = true;
    }
    opcodeGetPipeline() {
      // return a simple comma-separated list
      return pipelineEffects.join(",");
    }

    // not must. but it can make sure the post-process effect is correct (?)
    opcodeRequestReDraw() {
      vm.renderer.dirty = true;
      vm.runtime.requestRedraw();
    }
    opcodeGetPostProcess() {
      return drawprogram_mode;
    }
    //VERY DANGEROUS, SHOULDN'T BE USED BY NORMAL USERS. JUST FOR THE PRO.
    opcodeReplaceShader({ VS, FS }) {
      drawprogram = createProgram (
        gl, 
        createshader(gl, gl.VERTEX_SHADER, VS), 
        createshader(gl, gl.FRAGMENT_SHADER, FS)
      );
      if (gl.isProgram(drawprogram) == false) {
        console.error("postprocess program not is valid.");
      }
      positionLocation = gl.getAttribLocation(drawprogram, "a_position");
      texcoordLocation = gl.getAttribLocation(drawprogram, "a_texcoord");
      textureLocation = gl.getUniformLocation(drawprogram, "u_texture");
      
      drawprogram_mode = "custom";
      if (textureLocation !== null) {
        gl.uniform1i(textureLocation, 0);
      }
      vm.renderer.dirty = true;
    }
    opcodeUniform2fv({ NAME, X, Y }) {
      // Extract actual uniform name from prefixed name (e.g., "glitch._BlockSize" -> "_BlockSize")
      const actualName = NAME.includes(".") ? NAME.split(".")[1] : NAME;
      
      if (actualName == "_Time") {
        timeruniform = false;
      }
      // Conditional logic: pipeline mode vs standalone mode
      if (drawprogram_mode === "pipeline") {
        // Pipeline mode: use pipeline system
        setPassParam(pipelineTargetIndex, actualName, [Scratch.Cast.toNumber(X), Scratch.Cast.toNumber(Y)]);
      } else {
        // Standalone/custom mode: set uniform directly
        setUniform2fv(gl, actualName, X, Y);
      }
      vm.runtime.requestRedraw();
      vm.renderer.dirty = true;
    }
    opcodeUniform1f({ NAME, X }) {
      // Extract actual uniform name from prefixed name (e.g., "dispersion._Amplitude" -> "_Amplitude")
      const actualName = NAME.includes(".") ? NAME.split(".")[1] : NAME;
      
      // Conditional logic: pipeline mode vs standalone mode
      if (drawprogram_mode === "pipeline") {
        // Pipeline mode: use pipeline system
        setPassParam(pipelineTargetIndex, actualName, Scratch.Cast.toNumber(X));
      } else {
        // Standalone/custom mode: set uniform directly
        setUniform1f(gl, actualName, X);
      }
      vm.runtime.requestRedraw();
      vm.renderer.dirty = true;
    }
  }
  // Post-processing class saved to local module variable.
  postprocessingClass = postprocessing;
})(Scratch);

//Post-AIO
(function (Scratch) {
  "use strict";

  Scratch.translate.setup({
    zh: {
      postAIO: "å¤åä¸åå¤ç v2.01",
      setShader: "å° [shader] è¿ç¨äºå±å¹",
      isShader: "[shader] è¿ç¨äºå±å¹?",
      shaderList: "ç¹æåè¡¨",
      setRectClipbox: "è®¾ç½®ç©å½¢è£åª x:[x] y:[y] w:[w] h:[h] dir:[dir]",
      setIRectClipbox: "è®¾ç½®ååç©å½¢è£åª x:[x] y:[y] w:[w] h:[h] dir:[dir]",
      setOvalClipbox: "è®¾ç½®æ¤­åè£åª x:[x] y:[y] w:[w] h:[h] dir:[dir]",
      setIOvalClipbox: "è®¾ç½®ååæ¤­åè£åª x:[x] y:[y] w:[w] h:[h] dir:[dir]",
      setTriangleClipbox: "è®¾ç½®ä¸è§å½¢è£åª x1:[x1] y1:[y1] x2:[x2] y2:[y2] x3:[x3] y3:[y3] dir:[dir]",
      setITriangleClipbox: "è®¾ç½®ååä¸è§å½¢è£åª x1:[x1] y1:[y1] x2:[x2] y2:[y2] x3:[x3] y3:[y3] dir:[dir]",
      getRectClipbox: "ç©å½¢è£åªç [prop]",
      getIRectClipbox: "ååç©å½¢è£åªç [prop]",
      getOvalClipbox: "æ¤­åè£åªç [prop]",
      getIOvalClipbox: "ååæ¤­åè£åªç [prop]",
      getTriangleClipbox: "ä¸è§å½¢è£åªç [prop]",
      getITriangleClipbox: "ååä¸è§å½¢è£åªç [prop]",
      clearClipbox: "æ¸é¤å½åè§è²çè£åª",
      setBlend: "å°æ··åæ¨¡å¼è®¾ä¸º [blend]",
      getBlend: "æ··åæ¨¡å¼",
      turnSetting: "å° [setting] è®¾ä¸º [state]",
      isSetting: "å¯ç¨ [setting]?",
      getDescrepency: "èå°ç [dimension] ç¼©æ¾åå¢",
      supportsGlslThree: "æ¯æ glsl 3.0?",
      default: "é»è®¤",
      additive: "å æ³",
      subtract: "åæ³",
      multiply: "æ­£çå åº",
      invert: "åè²",
      rectClip: "ç©å½¢è£åª",
      iRectClip: "ååç©å½¢è£åª",
      ovalClip: "æ¤­åè£åª",
      iOvalClip: "ååæ¤­åè£åª",
      triangleClip: "ä¸è§å½¢è£åª",
      iTriangleClip: "ååä¸è§å½¢è£åª",
      autoRerender: "èªå¨éç»",
      multiRender: "å¤éæ¸²æ",
      on: "å¯ç¨",
      off: "ç¦ç¨",
      width: "æ°´å¹³",
      height: "ç«ç´"
    }
  });

  const vm = Scratch.vm || {};
  const renderer = vm.renderer || {};
  const gl = renderer._gl;
  const twgl = (renderer.exports && renderer.exports.twgl) || {};
  const cast = Scratch.Cast;
  const defaultRectClipbox = () => ({ x: 0, y: 0, w: 0, h: 0, dir: 90 });
  const defaultTriangleClipbox = () => ({ x1: 0, y1: 0, x2: 0, y2: 0, x3: 0, y3: 0, dir: 90 });
  const MAX_CLIP_STACK = 8;
  const cloneClipbox = (clipbox) => Object.assign({}, clipbox);
  const hasRectClipbox = (clipbox) => !!clipbox && (clipbox.x !== 0 || clipbox.y !== 0 || clipbox.w !== 0 || clipbox.h !== 0 || clipbox.dir !== 90);
  const hasTriangleClipbox = (clipbox) => !!clipbox && (clipbox.x1 !== 0 || clipbox.y1 !== 0 || clipbox.x2 !== 0 || clipbox.y2 !== 0 || clipbox.x3 !== 0 || clipbox.y3 !== 0 || clipbox.dir !== 90);
  const getClipStack = (drawable, boxProp, stackProp, defaultFactory, hasClipbox) => {
    if (drawable[boxProp] === undefined) drawable[boxProp] = defaultFactory();
    if (!Array.isArray(drawable[stackProp])) {
      drawable[stackProp] = hasClipbox(drawable[boxProp]) ? [cloneClipbox(drawable[boxProp])] : [];
    }
    return drawable[stackProp];
  };
  const pushClipbox = (drawable, boxProp, stackProp, clipbox, defaultFactory, hasClipbox) => {
    const stack = getClipStack(drawable, boxProp, stackProp, defaultFactory, hasClipbox);
    stack.push(cloneClipbox(clipbox));
    drawable[boxProp] = cloneClipbox(clipbox);
  };
  const getActiveClipStack = (drawable, boxProp, stackProp, defaultFactory, hasClipbox) => {
    const stack = getClipStack(drawable, boxProp, stackProp, defaultFactory, hasClipbox);
    if (stack.length > 0) return stack.slice(-MAX_CLIP_STACK);
    return hasClipbox(drawable[boxProp]) ? [cloneClipbox(drawable[boxProp])] : [];
  };
  const buildRectClipUniformGroup = (stack, enabled, useBounds) => {
    const points1 = [];
    const points2 = [];
    const dirs = [];
    for (let i = 0; i < MAX_CLIP_STACK; i++) {
      const clip = stack[i] || null;
      if (clip) {
        if (useBounds) {
          points1.push(clip.x - clip.w, clip.y - clip.h);
          points2.push(clip.x + clip.w, clip.y + clip.h);
        } else {
          points1.push(clip.x, clip.y);
          points2.push(clip.w, clip.h);
        }
        dirs.push(clip.dir);
      } else {
        points1.push(0, 0);
        points2.push(0, 0);
        dirs.push(90);
      }
    }
    return {
      count: enabled ? stack.length : 0,
      point1: points1,
      point2: points2,
      dir: dirs
    };
  };
  const buildTriangleClipUniformGroup = (stack, enabled) => {
    const points1 = [];
    const points2 = [];
    const points3 = [];
    const dirs = [];
    for (let i = 0; i < MAX_CLIP_STACK; i++) {
      const clip = stack[i] || null;
      if (clip) {
        points1.push(clip.x1, clip.y1);
        points2.push(clip.x2, clip.y2);
        points3.push(clip.x3, clip.y3);
        dirs.push(clip.dir);
      } else {
        points1.push(0, 0);
        points2.push(0, 0);
        points3.push(0, 0);
        dirs.push(90);
      }
    }
    return {
      count: enabled ? stack.length : 0,
      point1: points1,
      point2: points2,
      point3: points3,
      dir: dirs
    };
  };

  class SM {
    static EFFECT_INFO = {
      color: {
        uniformName: "u_color",
        mask: 1 << 0,
        converter: (x) => (x / 200) % 1,
        shapeChanges: false
      },
      fisheye: {
        uniformName: "u_fisheye",
        mask: 1 << 1,
        converter: (x) => Math.max(0, (x + 100) / 100),
        shapeChanges: true
      },
      whirl: {
        uniformName: "u_whirl",
        mask: 1 << 2,
        converter: (x) => (-x * Math.PI) / 180,
        shapeChanges: true
      },
      pixelate: {
        uniformName: "u_pixelate",
        mask: 1 << 3,
        converter: (x) => Math.abs(x) / 10,
        shapeChanges: true
      },
      mosaic: {
        uniformName: "u_mosaic",
        mask: 1 << 4,
        converter: (x) => {
          x = Math.round((Math.abs(x) + 10) / 10);
          return Math.max(1, Math.min(x, 512));
        },
        shapeChanges: true
      },
      brightness: {
        uniformName: "u_brightness",
        mask: 1 << 5,
        converter: (x) => Math.max(-100, Math.min(x, 100)) / 100,
        shapeChanges: false
      },
      ghost: {
        uniformName: "u_ghost",
        mask: 1 << 6,
        converter: (x) => 1 - Math.max(0, Math.min(x, 100)) / 100,
        shapeChanges: false
      }
    };
    static EFFECTS = Object.keys(SM.EFFECT_INFO);
    static DRAW_MODE = {
      default: "default",
      straightAlpha: "straightAlpha",
      silhouette: "silhouette",
      colorMask: "colorMask",
      line: "line",
      background: "background"
    };
  }
  const frag =
`precision mediump float;

#define MAX_CLIP_STACK ${MAX_CLIP_STACK}

uniform int r_clipCount;
uniform vec2 r_clip1[MAX_CLIP_STACK];
uniform vec2 r_clip2[MAX_CLIP_STACK];
uniform float r_clipDir[MAX_CLIP_STACK];

uniform int ir_clipCount;
uniform vec2 ir_clip1[MAX_CLIP_STACK];
uniform vec2 ir_clip2[MAX_CLIP_STACK];
uniform float ir_clipDir[MAX_CLIP_STACK];

uniform int o_clipCount;
uniform vec2 o_clip1[MAX_CLIP_STACK];
uniform vec2 o_clip2[MAX_CLIP_STACK];
uniform float o_clipDir[MAX_CLIP_STACK];

uniform int io_clipCount;
uniform vec2 io_clip1[MAX_CLIP_STACK];
uniform vec2 io_clip2[MAX_CLIP_STACK];
uniform float io_clipDir[MAX_CLIP_STACK];

uniform int t_clipCount;
uniform vec2 t_clip1[MAX_CLIP_STACK];
uniform vec2 t_clip2[MAX_CLIP_STACK];
uniform vec2 t_clip3[MAX_CLIP_STACK];
uniform float t_clipDir[MAX_CLIP_STACK];

uniform int it_clipCount;
uniform vec2 it_clip1[MAX_CLIP_STACK];
uniform vec2 it_clip2[MAX_CLIP_STACK];
uniform vec2 it_clip3[MAX_CLIP_STACK];
uniform float it_clipDir[MAX_CLIP_STACK];

uniform vec2 spritePos;
uniform vec2 spriteTexwh;
uniform vec2 spriteRCenter;
uniform vec2 spriteSize;
uniform float spriteDir;

#ifdef DRAW_MODE_silhouette
uniform vec4 u_silhouetteColor;
#else
# ifdef ENABLE_color
uniform float u_color;
# endif
# ifdef ENABLE_brightness
uniform float u_brightness;
# endif
#endif

#ifdef DRAW_MODE_colorMask
uniform vec3 u_colorMask;
uniform float u_colorMaskTolerance;
#endif

#ifdef ENABLE_fisheye
uniform float u_fisheye;
#endif
#ifdef ENABLE_whirl
uniform float u_whirl;
#endif
#ifdef ENABLE_pixelate
uniform float u_pixelate;
uniform vec2 u_skinSize;
#endif
#ifdef ENABLE_mosaic
uniform float u_mosaic;
#endif
#ifdef ENABLE_ghost
uniform float u_ghost;
#endif

#ifdef DRAW_MODE_line
varying vec4 v_lineColor;
varying float v_lineThickness;
varying float v_lineLength;
#endif

#ifdef DRAW_MODE_background
uniform vec4 u_backgroundColor;
#endif

uniform sampler2D u_skin;

#ifndef DRAW_MODE_background
varying vec2 v_texCoord;
#endif

const float epsilon = 1e-3;

#if !defined(DRAW_MODE_silhouette) && (defined(ENABLE_color))

vec3 convertRGB2HSV(vec3 rgb)
{
  const vec4 hueOffsets = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 temp1 = rgb.b > rgb.g ? vec4(rgb.bg, hueOffsets.wz) : vec4(rgb.gb, hueOffsets.xy);
  vec4 temp2 = rgb.r > temp1.x ? vec4(rgb.r, temp1.yzx) : vec4(temp1.xyw, rgb.r);
  float m = min(temp2.y, temp2.w);
  float C = temp2.x - m;
  float V = temp2.x;
  return vec3(abs(temp2.z + (temp2.w - temp2.y) / (6.0 * C + epsilon)), C / (temp2.x + epsilon), V);
}
vec3 convertHue2RGB(float hue)
{
  float r = abs(hue * 6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(hue * 6.0 - 2.0);
  float b = 2.0 - abs(hue * 6.0 - 4.0);
  return clamp(vec3(r, g, b), 0.0, 1.0);
}

vec3 convertHSV2RGB(vec3 hsv)
{
  vec3 rgb = convertHue2RGB(hsv.x);
  float c = hsv.z * hsv.y;
  return rgb * c + hsv.z - c;
}
#endif

const vec2 kCenter = vec2(0.5, 0.5);

void main()
{
  #if !(defined(DRAW_MODE_line) || defined(DRAW_MODE_background))
  vec2 texcoord0 = v_texCoord;

  #ifdef ENABLE_mosaic
  texcoord0 = fract(u_mosaic * texcoord0);
  #endif

  #ifdef ENABLE_pixelate
  {
    vec2 pixelTexelSize = u_skinSize / u_pixelate;
    texcoord0 = (floor(texcoord0 * pixelTexelSize) + kCenter) / pixelTexelSize;
  }
  #endif

  #ifdef ENABLE_whirl
  {
    const float kRadius = 0.5;
    vec2 offset = texcoord0 - kCenter;
    float offsetMagnitude = length(offset);
    float whirlFactor = max(1.0 - (offsetMagnitude / kRadius), 0.0);
    float whirlActual = u_whirl * whirlFactor * whirlFactor;
    float sinWhirl = sin(whirlActual);
    float cosWhirl = cos(whirlActual);
    mat2 rotationMatrix = mat2(cosWhirl, -sinWhirl, sinWhirl, cosWhirl);

    texcoord0 = rotationMatrix * offset + kCenter;
  }
  #endif

  #ifdef ENABLE_fisheye
  {
    vec2 vec = (texcoord0 - kCenter) / kCenter;
    float vecLength = length(vec);
    float r = pow(min(vecLength, 1.0), u_fisheye) * max(1.0, vecLength);
    vec2 unit = vec / vecLength;

    texcoord0 = kCenter + r * unit * kCenter;
  }
  #endif

  gl_FragColor = texture2D(u_skin, texcoord0);

  vec2 tpos = vec2(spritePos.x - spriteTexwh.x / 2.0 + texcoord0.x * spriteTexwh.x, spritePos.y + spriteTexwh.y / 2.0 - texcoord0.y * spriteTexwh.y);
  vec2 rcfix = vec2(spriteTexwh.x / 2.0 - spriteRCenter.x * spriteSize.x / 100.0, spriteRCenter.y * spriteSize.y / 100.0 - spriteTexwh.y / 2.0);
  vec2 dxy = tpos - spritePos + rcfix;
  vec2 pos;
  float cosv = cos(radians(spriteDir - 90.0)), sinv = sin(radians(spriteDir - 90.0));
  pos.x = spritePos.x + (dxy.x * cosv + dxy.y * sinv);
  pos.y = spritePos.y + (-dxy.x * sinv + dxy.y * cosv);

  bool hasPositiveClip = false;
  bool inPositiveClip = false;

  if (r_clipCount > 0)
  {
    hasPositiveClip = true;
    for (int i = 0; i < MAX_CLIP_STACK; i++)
    {
      if (i >= r_clipCount) break;
      vec2 center = (r_clip1[i] + r_clip2[i]) / 2.0;
      float cosv = cos(radians(r_clipDir[i] + 90.0)), sinv = sin(radians(r_clipDir[i] + 90.0));
      vec2 rpos;
      rpos.x = (pos.x - center.x) * cosv - (pos.y - center.y) * sinv;
      rpos.y = (pos.x - center.x) * sinv + (pos.y - center.y) * cosv;
      rpos += center;
      if (rpos.x >= r_clip1[i].x && rpos.x <= r_clip2[i].x && rpos.y >= r_clip1[i].y && rpos.y <= r_clip2[i].y) inPositiveClip = true;
    }
  }
  for (int i = 0; i < MAX_CLIP_STACK; i++)
  {
    if (i >= ir_clipCount) break;
    vec2 center = (ir_clip1[i] + ir_clip2[i]) / 2.0;
    float cosv = cos(radians(ir_clipDir[i] + 90.0)), sinv = sin(radians(ir_clipDir[i] + 90.0));
    vec2 rpos;
    rpos.x = (pos.x - center.x) * cosv - (pos.y - center.y) * sinv;
    rpos.y = (pos.x - center.x) * sinv + (pos.y - center.y) * cosv;
    rpos += center;
    if (rpos.x >= ir_clip1[i].x && rpos.x <= ir_clip2[i].x && rpos.y >= ir_clip1[i].y && rpos.y <= ir_clip2[i].y) discard;
  }

  if (o_clipCount > 0)
  {
    hasPositiveClip = true;
    for (int i = 0; i < MAX_CLIP_STACK; i++)
    {
      if (i >= o_clipCount) break;
      float cosv = cos(radians(90.0 - o_clipDir[i])), sinv = sin(radians(90.0 - o_clipDir[i]));
      vec2 rpos;
      rpos.x = (pos.x - o_clip1[i].x) * cosv + (pos.y - o_clip1[i].y) * sinv;
      rpos.y = -(pos.x - o_clip1[i].x) * sinv + (pos.y - o_clip1[i].y) * cosv;
      if (((rpos.x * rpos.x) / (o_clip2[i].x * o_clip2[i].x) + (rpos.y * rpos.y) / (o_clip2[i].y * o_clip2[i].y)) <= 1.0) inPositiveClip = true;
    }
  }
  for (int i = 0; i < MAX_CLIP_STACK; i++)
  {
    if (i >= io_clipCount) break;
    float cosv = cos(radians(90.0 - io_clipDir[i])), sinv = sin(radians(90.0 - io_clipDir[i]));
    vec2 rpos;
    rpos.x = (pos.x - io_clip1[i].x) * cosv + (pos.y - io_clip1[i].y) * sinv;
    rpos.y = -(pos.x - io_clip1[i].x) * sinv + (pos.y - io_clip1[i].y) * cosv;
    if (((rpos.x * rpos.x) / (io_clip2[i].x * io_clip2[i].x) + (rpos.y * rpos.y) / (io_clip2[i].y * io_clip2[i].y)) <= 1.0) discard;
  }

  if (t_clipCount > 0)
  {
    hasPositiveClip = true;
    for (int i = 0; i < MAX_CLIP_STACK; i++)
    {
      if (i >= t_clipCount) break;
      vec2 center = (t_clip1[i] + t_clip2[i] + t_clip3[i]) / 3.0;
      float cosv = cos(radians(90.0 - t_clipDir[i])), sinv = sin(radians(90.0 - t_clipDir[i]));
      vec2 rpos;
      rpos.x = center.x + (pos.x - center.x) * cosv - (pos.y - center.y) * sinv;
      rpos.y = center.y + (pos.x - center.x) * sinv + (pos.y - center.y) * cosv;
      float areaABC = abs((t_clip1[i].x * (t_clip2[i].y - t_clip3[i].y) + t_clip2[i].x * (t_clip3[i].y - t_clip1[i].y) + t_clip3[i].x * (t_clip1[i].y - t_clip2[i].y)) / 2.0);
      float areaPAB = abs((rpos.x * (t_clip1[i].y - t_clip2[i].y) + t_clip1[i].x * (t_clip2[i].y - rpos.y) + t_clip2[i].x * (rpos.y - t_clip1[i].y)) / 2.0);
      float areaPBC = abs((rpos.x * (t_clip2[i].y - t_clip3[i].y) + t_clip2[i].x * (t_clip3[i].y - rpos.y) + t_clip3[i].x * (rpos.y - t_clip2[i].y)) / 2.0);
      float areaPCA = abs((rpos.x * (t_clip3[i].y - t_clip1[i].y) + t_clip3[i].x * (t_clip1[i].y - rpos.y) + t_clip1[i].x * (rpos.y - t_clip3[i].y)) / 2.0);
      if (abs(areaABC - areaPAB - areaPBC - areaPCA) <= epsilon) inPositiveClip = true;
    }
  }

  if (hasPositiveClip && !inPositiveClip)
  {
    discard;
  }
  for (int i = 0; i < MAX_CLIP_STACK; i++)
  {
    if (i >= it_clipCount) break;
    vec2 center = (it_clip1[i] + it_clip2[i] + it_clip3[i]) / 3.0;
    float cosv = cos(radians(it_clipDir[i] + 90.0)), sinv = sin(radians(it_clipDir[i] + 90.0));
    vec2 rpos;
    rpos.x = center.x + (pos.x - center.x) * cosv - (pos.y - center.y) * sinv;
    rpos.y = center.y + (pos.x - center.x) * sinv + (pos.y - center.y) * cosv;
    float areaABC = abs((it_clip1[i].x * (it_clip2[i].y - it_clip3[i].y) + it_clip2[i].x * (it_clip3[i].y - it_clip1[i].y) + it_clip3[i].x * (it_clip1[i].y - it_clip2[i].y)) / 2.0);
    float areaPAB = abs((rpos.x * (it_clip1[i].y - it_clip2[i].y) + it_clip1[i].x * (it_clip2[i].y - rpos.y) + it_clip2[i].x * (rpos.y - it_clip1[i].y)) / 2.0);
    float areaPBC = abs((rpos.x * (it_clip2[i].y - it_clip3[i].y) + it_clip2[i].x * (it_clip3[i].y - rpos.y) + it_clip3[i].x * (rpos.y - it_clip2[i].y)) / 2.0);
    float areaPCA = abs((rpos.x * (it_clip3[i].y - it_clip1[i].y) + it_clip3[i].x * (it_clip1[i].y - rpos.y) + it_clip1[i].x * (rpos.y - it_clip3[i].y)) / 2.0);
    if (abs(areaABC - areaPAB - areaPBC - areaPCA) <= epsilon) discard;
  }

  #if defined(ENABLE_color) || defined(ENABLE_brightness)
  gl_FragColor.rgb = clamp(gl_FragColor.rgb / (gl_FragColor.a + epsilon), 0.0, 1.0);

  #ifdef ENABLE_color
  {
    vec3 hsv = convertRGB2HSV(gl_FragColor.xyz);

    const float minLightness = 0.11 / 2.0;
    const float minSaturation = 0.09;
    if (hsv.z < minLightness) hsv = vec3(0.0, 1.0, minLightness);
    else if (hsv.y < minSaturation) hsv = vec3(0.0, minSaturation, hsv.z);

    hsv.x = mod(hsv.x + u_color, 1.0);
    if (hsv.x < 0.0) hsv.x += 1.0;

    gl_FragColor.rgb = convertHSV2RGB(hsv);
  }
  #endif

  #ifdef ENABLE_brightness
  gl_FragColor.rgb = clamp(gl_FragColor.rgb + vec3(u_brightness), vec3(0), vec3(1));
  #endif

  gl_FragColor.rgb *= gl_FragColor.a + epsilon;

  #endif

  #ifdef ENABLE_ghost
  gl_FragColor *= u_ghost;
  #endif

  #ifdef DRAW_MODE_silhouette
  if (gl_FragColor.a == 0.0) discard;
  gl_FragColor = u_silhouetteColor;
  #else

  #ifdef DRAW_MODE_colorMask
  vec3 maskDistance = abs(gl_FragColor.rgb - u_colorMask);
  vec3 colorMaskTolerance = vec3(u_colorMaskTolerance, u_colorMaskTolerance, u_colorMaskTolerance);
  if (any(greaterThan(maskDistance, colorMaskTolerance))) discard;
  #endif
  #endif

  #ifdef DRAW_MODE_straightAlpha
  gl_FragColor.rgb /= gl_FragColor.a + epsilon;
  #endif

  #endif

  #ifdef DRAW_MODE_line

  float d = ((v_texCoord.x - clamp(v_texCoord.x, 0.0, v_lineLength)) * 0.5) + 0.5;
  float line = distance(vec2(0.5), vec2(d, v_texCoord.y)) * 2.0;
  line -= ((v_lineThickness - 1.0) * 0.5);

  gl_FragColor = v_lineColor * clamp(1.0 - line, 0.0, 1.0);
  #endif

  #ifdef DRAW_MODE_background
  gl_FragColor = u_backgroundColor;
  #endif
}`, vert =
`precision mediump float;

#ifdef DRAW_MODE_line
uniform vec2 u_stageSize;
attribute vec2 a_lineThicknessAndLength;
attribute vec4 a_penPoints;
attribute vec4 a_lineColor;

varying vec4 v_lineColor;
varying float v_lineThickness;
varying float v_lineLength;
varying vec4 v_penPoints;

const float epsilon = 1e-3;
#endif

#if !(defined(DRAW_MODE_line) || defined(DRAW_MODE_background))
uniform mat4 u_projectionMatrix;
uniform mat4 u_modelMatrix;
attribute vec2 a_texCoord;
#endif

attribute vec2 a_position;

varying vec2 v_texCoord;

void main() {
  #ifdef DRAW_MODE_line
  vec2 position = a_position;
  float expandedRadius = (a_lineThicknessAndLength.x * 0.5) + 1.4142135623730951;

  v_texCoord.x = mix(0.0, a_lineThicknessAndLength.y + (expandedRadius * 2.0), a_position.x) - expandedRadius;
  v_texCoord.y = ((a_position.y - 0.5) * expandedRadius) + 0.5;

  position.x *= a_lineThicknessAndLength.y + (2.0 * expandedRadius);
  position.y *= 2.0 * expandedRadius;

  position -= expandedRadius;

  vec2 pointDiff = a_penPoints.zw;

  pointDiff.x = (abs(pointDiff.x) < epsilon && abs(pointDiff.y) < epsilon) ? epsilon : pointDiff.x;
  vec2 normalized = pointDiff / max(a_lineThicknessAndLength.y, epsilon);
  position = mat2(normalized.x, normalized.y, -normalized.y, normalized.x) * position;

  position += a_penPoints.xy;

  position *= 2.0 / u_stageSize;
  gl_Position = vec4(position, 0, 1);

  v_lineColor = a_lineColor;
  v_lineThickness = a_lineThicknessAndLength.x;
  v_lineLength = a_lineThicknessAndLength.y;
  v_penPoints = a_penPoints;
  #elif defined(DRAW_MODE_background)
  gl_Position = vec4(a_position * 2.0, 0, 1);
  #else
  gl_Position = u_projectionMatrix * u_modelMatrix * vec4(a_position, 0, 1);
  v_texCoord = a_texCoord;
  #endif
}`;

  renderer._shaderManager._buildShader = function (drawMode, effectBits) {
    const ShaderManager = SM;
    const numEffects = ShaderManager.EFFECTS.length;

    const defines = [`#define DRAW_MODE_${drawMode}`];
    for (let i = 0; i < numEffects; ++i) {
      if ((effectBits & (1 << i)) !== 0) {
        defines.push(`#define ENABLE_${ShaderManager.EFFECTS[i]}`);
      }
      
    }

    const definesText = `${defines.join("\n")}\n`;
    const vsFullText = definesText + vert;
    const fsFullText = definesText + frag;

    // FIX: Use the global twgl.createProgramInfo which may have been patched by Looks Expanded
    // Instead of using renderer.exports.twgl directly, use the one from the VM exports
    return renderer.exports.twgl.createProgramInfo(this._gl, [vsFullText, fsFullText]);
  };
  renderer._shaderManager._shaderCache["default"][0] = renderer._shaderManager._buildShader("default", 0);

  let blendingActive = false;
  renderer._drawThese = function (drawables, drawMode, projection, opts = {}) {
    blendingActive = true;
    let currentShader = null;
    const framebufferSpaceScaleDiffers = (
      "framebufferWidth" in opts && "framebufferHeight" in opts &&
      opts.framebufferWidth !== this._nativeSize[0] && opts.framebufferHeight !== this._nativeSize[1]);

    const normalDrawables = [];
    const deferredBehindDrawables = [];
    for (let i = 0; i < drawables.length; i++) {
      const drawableID = drawables[i];
      const drawable = this._allDrawables[drawableID];
      if (drawable && drawable.blendMode === "default behind") {
        deferredBehindDrawables.push(drawableID);
      } else {
        normalDrawables.push(drawableID);
      }
    }
    const orderedDrawables = normalDrawables.concat(deferredBehindDrawables);

    const numDrawables = orderedDrawables.length;
    for (let drawableIndex = 0; drawableIndex < numDrawables; ++drawableIndex) {
      const drawableID = orderedDrawables[drawableIndex];
      if (opts.filter && !opts.filter(drawableID)) continue;
      const drawable = this._allDrawables[drawableID];
      if (!drawable.getVisible() && !opts.ignoreVisibility) continue;
      if (opts.skipPrivateSkins && drawable.skin.private) continue;

      const drawableScale = (framebufferSpaceScaleDiffers ?
        [drawable.scale[0] * opts.framebufferWidth / this._nativeSize[0],
        drawable.scale[1] * opts.framebufferHeight / this._nativeSize[1]] : drawable.scale);

      if (!drawable.skin || !drawable.skin.getTexture(drawableScale)) continue;

      const uniforms = {};
      let effectBits = drawable.enabledEffects;
      effectBits &= (Object.prototype.hasOwnProperty.call(opts, "effectMask") ? opts.effectMask : effectBits);

      const newShader = this._shaderManager.getShader(drawMode, effectBits);
      if (this._regionId !== newShader) {
        this._doExitDrawRegion();
        this._regionId = newShader;
        currentShader = newShader;
        gl.useProgram(currentShader.program);
        twgl.setBuffersAndAttributes(gl, currentShader, this._bufferInfo);
        Object.assign(uniforms, { u_projectionMatrix: projection });
      }

      Object.assign(uniforms, drawable.skin.getUniforms(drawableScale), drawable.getUniforms());

      if (opts.extraUniforms) Object.assign(uniforms, opts.extraUniforms);
      if (uniforms.u_skin) {
        twgl.setTextureParameters(gl, uniforms.u_skin, {
          minMag: drawable.skin.useNearest(drawableScale, drawable) ? gl.NEAREST : gl.LINEAR
        });
      }

      let temp;
      let clipStack;
      if (drawable.rClipbox == undefined) drawable.rClipbox = defaultRectClipbox();
      if (drawable.rClip == undefined) drawable.rClip = false;
      clipStack = getActiveClipStack(drawable, "rClipbox", "rClipboxes", defaultRectClipbox, hasRectClipbox);
      temp = buildRectClipUniformGroup(clipStack, drawable.rClip, true);
      Object.assign(uniforms, {
        r_clipCount: temp.count,
        r_clip1: temp.point1,
        r_clip2: temp.point2,
        r_clipDir: temp.dir
      });

      if (drawable.irClipbox  == undefined) drawable.irClipbox = defaultRectClipbox();
      if (drawable.irClip == undefined) drawable.irClip = false;
      clipStack = getActiveClipStack(drawable, "irClipbox", "irClipboxes", defaultRectClipbox, hasRectClipbox);
      temp = buildRectClipUniformGroup(clipStack, drawable.irClip, true);
      Object.assign(uniforms, {
        ir_clipCount: temp.count,
        ir_clip1: temp.point1,
        ir_clip2: temp.point2,
        ir_clipDir: temp.dir
      });

      if (drawable.oClipbox  == undefined) drawable.oClipbox = defaultRectClipbox();
      if (drawable.oClip == undefined) drawable.oClip = false;
      clipStack = getActiveClipStack(drawable, "oClipbox", "oClipboxes", defaultRectClipbox, hasRectClipbox);
      temp = buildRectClipUniformGroup(clipStack, drawable.oClip, false);
      Object.assign(uniforms, {
        o_clipCount: temp.count,
        o_clip1: temp.point1,
        o_clip2: temp.point2,
        o_clipDir: temp.dir
      });

      if (drawable.ioClipbox  == undefined) drawable.ioClipbox = defaultRectClipbox();
      if (drawable.ioClip == undefined) drawable.ioClip = false;
      clipStack = getActiveClipStack(drawable, "ioClipbox", "ioClipboxes", defaultRectClipbox, hasRectClipbox);
      temp = buildRectClipUniformGroup(clipStack, drawable.ioClip, false);
      Object.assign(uniforms, {
        io_clipCount: temp.count,
        io_clip1: temp.point1,
        io_clip2: temp.point2,
        io_clipDir: temp.dir
      });

      if (drawable.tClipbox  == undefined) drawable.tClipbox = defaultTriangleClipbox();
      if (drawable.tClip == undefined) drawable.tClip = false;
      clipStack = getActiveClipStack(drawable, "tClipbox", "tClipboxes", defaultTriangleClipbox, hasTriangleClipbox);
      temp = buildTriangleClipUniformGroup(clipStack, drawable.tClip);
      Object.assign(uniforms, {
        t_clipCount: temp.count,
        t_clip1: temp.point1,
        t_clip2: temp.point2,
        t_clip3: temp.point3,
        t_clipDir: temp.dir
      });

      if (drawable.itClipbox  == undefined) drawable.itClipbox = defaultTriangleClipbox();
      if (drawable.itClip == undefined) drawable.itClip = false;
      clipStack = getActiveClipStack(drawable, "itClipbox", "itClipboxes", defaultTriangleClipbox, hasTriangleClipbox);
      temp = buildTriangleClipUniformGroup(clipStack, drawable.itClip);
      Object.assign(uniforms, {
        it_clipCount: temp.count,
        it_clip1: temp.point1,
        it_clip2: temp.point2,
        it_clip3: temp.point3,
        it_clipDir: temp.dir
      });

      Object.assign(uniforms, {
        spriteTexwh: [drawable._skinScale[0], drawable._skinScale[1]],
        spritePos: [drawable._position[0], drawable._position[1]],
        spriteRCenter: [drawable.skin.rotationCenter[0], drawable.skin.rotationCenter[1]],
        spriteSize: drawable.scale,
        spriteDir: drawable._direction
      });

      twgl.setUniforms(currentShader, uniforms);
      twgl.drawBufferInfo(gl, this._bufferInfo, gl.TRIANGLES);
    }
    this._regionId = null;
    gl.disable(gl.SCISSOR_TEST);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    blendingActive = false;
  }

  const Blendings = Object.assign(Object.create(null), {
    "default": [gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.FUNC_ADD],
    "default behind": [gl.ONE_MINUS_DST_ALPHA, gl.ONE, gl.ONE_MINUS_DST_ALPHA, gl.ONE, gl.FUNC_ADD],
    "additive": [gl.ONE, gl.ONE, gl.ZERO, gl.ONE, gl.FUNC_ADD],
    "additive with alpha": [gl.ONE, gl.ONE, gl.ONE, gl.ONE, gl.FUNC_ADD],
    "additive legacy": [gl.ONE, gl.ONE, gl.ONE, gl.ONE, gl.FUNC_ADD],
    "subtract": [gl.ONE, gl.ONE, gl.ZERO, gl.ONE, gl.FUNC_REVERSE_SUBTRACT],
    "subtract with alpha": [gl.ONE, gl.ONE, gl.ONE, gl.ONE, gl.FUNC_REVERSE_SUBTRACT],
    "subtract legacy": [gl.ONE, gl.ONE, gl.ONE, gl.ONE, gl.FUNC_REVERSE_SUBTRACT],
    "multiply": [gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.FUNC_ADD],
    "invert": [gl.ONE_MINUS_DST_COLOR, gl.ONE_MINUS_SRC_COLOR, gl.ZERO, gl.ONE, gl.FUNC_ADD],
    "invert legacy": [gl.ONE_MINUS_DST_COLOR, gl.ONE_MINUS_SRC_COLOR, gl.ONE_MINUS_DST_COLOR, gl.ONE_MINUS_SRC_COLOR, gl.FUNC_ADD],
    "mask": [gl.ZERO, gl.SRC_ALPHA, gl.ZERO, gl.SRC_ALPHA, gl.FUNC_ADD],
    "erase": [gl.ZERO, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA, gl.FUNC_ADD],
  });

  const publicApi = vm.runtime.ext_clippingblendingapi ?? (vm.runtime.ext_clippingblendingapi = {});
  if (!publicApi.mainFramebuffer) publicApi.mainFramebuffer = null;
  let blendingToCanvas = false;

  const originalBindFramebuffer = gl.bindFramebuffer;
  gl.bindFramebuffer = function (target, framebuffer) {
    if (target === gl.FRAMEBUFFER || target === gl.DRAW_FRAMEBUFFER) {
      const penSkinId = renderer._penSkinId;
      const penSkin = penSkinId !== null ? renderer._allSkins[penSkinId] : null;
      const penFramebuffer = penSkin && penSkin._framebuffer ? penSkin._framebuffer.framebuffer : null;
      blendingToCanvas = framebuffer === publicApi.mainFramebuffer || framebuffer === null;

      if (framebuffer === penFramebuffer) {
        blendingToCanvas = false;
      }

      if (blendingToCanvas) {
        Blendings["subtract legacy"][2] = gl.ZERO;
        Blendings["invert legacy"][2] = gl.ZERO;
        Blendings["invert legacy"][3] = gl.ONE;
      } else {
        Blendings["subtract legacy"][2] = gl.ONE;
        Blendings["invert legacy"][2] = gl.ONE_MINUS_DST_COLOR;
        Blendings["invert legacy"][3] = gl.ONE_MINUS_SRC_COLOR;
      }
    }

    return originalBindFramebuffer.call(this, target, framebuffer);
  };

  const proto = renderer.exports.Drawable.prototype;
  const gu = proto.getUniforms;
  proto.getUniforms = function () {
    if (!blendingActive) {
      return gu.call(this);
    }

    const blendMode = this.blendMode || "default";
    const blend = Blendings[blendMode] || Blendings.default;
    if (!Blendings[blendMode]) this.blendMode = "default";

    gl.enable(gl.BLEND);
    gl.blendEquation(blend[4]);
    gl.blendFuncSeparate(blend[0], blend[1], blend[2], blend[3]);

    return gu.call(this);
  };

  function resetAll()
  {
    renderer._allDrawables.forEach((drawable) => {
      drawable.blendMode = "default";
      drawable.rClip = false;
      drawable.irClip = false;
      drawable.oClip = false;
      drawable.ioClip = false;
      drawable.tClip = false;
      drawable.itClip = false;
      drawable.rClipboxes = [];
      drawable.irClipboxes = [];
      drawable.oClipboxes = [];
      drawable.ioClipboxes = [];
      drawable.tClipboxes = [];
      drawable.itClipboxes = [];
    });
    currentShader = [];
  }
  vm.runtime.on("RUNTIME_DISPOSED", resetAll);
  vm.runtime.on("PROJECT_LOADED", resetAll);
  vm.runtime.on("PROJECT_STOP_ALL", resetAll);

  const props = [
    "blendMode", "rClipbox", "irClipbox", "oClipbox", "ioClipbox",
    "tClipbox", "itClipbox", "rClipboxes", "irClipboxes", "oClipboxes", "ioClipboxes",
    "tClipboxes", "itClipboxes", "rClip", "irClip", "oClip", "ioClip", "tClip", "itClip"
  ];
  vm.runtime.on("targetWasCreated", (target, originalTarget) => {
    if (!originalTarget) return;
    props.forEach((prop) => {
      if (prop in originalTarget) target[prop] = originalTarget[prop];
    });
  });

  let penPlus = null;
  vm.runtime.on("EXTENSION_ADDED", () => {
    if (!penPlus) penPlus = vm.runtime.ext_obviousalexc_penPlus;
  });

  let autoRerender = true;
  let multiRender = true;

  let reRenderInfo = twgl.createBufferInfoFromArrays(gl, {
    a_position: { numComponents: 4, data: [
      -1, -1, 0, 1,
      1, -1, 0, 1,
      1, 1, 0, 1,
      -1, -1, 0, 1,
      1, 1, 0, 1,
      -1, 1, 0, 1
    ]},
    a_texCoord: { numComponents: 2, data: [
      0, 1,
      1, 1,
      1, 0,
      0, 1,
      1, 0,
      0, 0
    ]},
    a_color: { numComponents: 4, data: [
      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 1, 1,

      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 1, 1
    ]}
  });
  const stageBufferAttachments = [
    {
      format: gl.RGBA,
      type: gl.UNSIGNED_BYTE,
      min: gl.LINEAR,
      wrap: gl.CLAMP,
      premultiplyAlpha: false
    },
    { format: gl.DEPTH_STENCIL }
  ];
  const currentFrameBuffer = [
    twgl.createFramebufferInfo(gl, stageBufferAttachments),
    twgl.createFramebufferInfo(gl, stageBufferAttachments)];
  let currentShader = [];

  const postAIODraw = function () {
    if (!this.dirty) return;
    this.dirty = false;
    this._doExitDrawRegion();

    const shaderCount = currentShader.length;
    let inputBuffer = null;
    let outputBuffer = currentFrameBuffer[0];
    if (shaderCount > 0) {
      twgl.resizeFramebufferInfo(gl, outputBuffer, stageBufferAttachments, gl.canvas.width, gl.canvas.height);
      twgl.bindFramebufferInfo(gl, outputBuffer);
      inputBuffer = outputBuffer;
    }
    else twgl.bindFramebufferInfo(gl, null);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(...this._backgroundColor4f);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const snapshotRequested = this._snapshotCallbacks.length > 0;
    this._drawThese(this._drawList, "default", this._projection, {
      framebufferWidth: gl.canvas.width,
      framebufferHeight: gl.canvas.height,
      skipPrivateSkins: snapshotRequested
    });
    if (snapshotRequested) {
      const snapshot = gl.canvas.toDataURL();
      this._snapshotCallbacks.forEach((cb) => cb(snapshot));
      this._snapshotCallbacks = [];
      this.dirty = true;
    }

    for (let i = 0; i < shaderCount; ++i) {
      const shader = currentShader[i];
      const isLast = (i === shaderCount - 1);
      outputBuffer = (isLast ? null : currentFrameBuffer[(i + 1) % 2]);
      if (!isLast) twgl.resizeFramebufferInfo(gl, outputBuffer, stageBufferAttachments, gl.canvas.width, gl.canvas.height);
      twgl.bindFramebufferInfo(gl, outputBuffer);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (penPlus.programs[shader]) {
        gl.useProgram(penPlus.programs[shader].info.program);
        twgl.setBuffersAndAttributes(gl, penPlus.programs[shader].info, reRenderInfo);

        penPlus.programs[shader].uniformDat.u_skin = inputBuffer.attachments[0];
        penPlus.programs[shader].uniformDat.u_res = [gl.canvas.width, gl.canvas.height];
        penPlus.programs[shader].uniformDat.u_timer = vm.runtime.ioDevices.clock.projectTimer();
        penPlus.programs[shader].uniformDat.u_transform = [
          1, 1, 0, 0,
          0, 1, 0, 0,
          0, 0, 0, 0,
          0, 0, 0, 0
        ];
        twgl.setUniforms(penPlus.programs[shader].info, penPlus.programs[shader].uniformDat);
        twgl.drawBufferInfo(gl, reRenderInfo);
      }
      inputBuffer = outputBuffer;
    }
    this.dirty = autoRerender;
  }

  // IMPORTANT: Don't override renderer.draw if post-processing has already set it
  // Post-processing (v4) provides the main rendering pipeline with effects
  if (!postProcessingDraw) {
    renderer.draw = postAIODraw;
  }

  let shadedStampsAdded = false;
  window.addEventListener("message", (event) => {
    let eventType = event.data && event.data.type;
    if (!eventType) return;
    if (
      eventType === "EXTENSION_REQUEST" &&
      !shadedStampsAdded &&
      penPlus &&
      penPlus.IFrame &&
      event.source === penPlus.IFrame.contentWindow
    ) {
      shadedStampsAdded = true;
      penPlus.IFrame.contentWindow.postMessage(
        {
          type: "ADD_EXTENSION",
          URL: "https://pen-group.github.io/extensions/extensions/ShadedStamps/shaderEditorExtension.js"
        },
        penPlus.IFrame.src
      );
    }
  });

  class Extension {
    getInfo() {
      return {
        id: "PostAIO",
        name: Scratch.translate({ id: "postAIO", default: "Post All-in-one v2.01" }),
        blocks: [
          {
            blockType: Scratch.BlockType.XML,
            xml: `<sep gap="24"/><label text="${Scratch.translate("Post-AIO")}"/><sep gap="12"/>`,
          },
          {
            opcode: "setShader",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate({ id: "setShader", default: "Set [shader] shader on screen" }),
            arguments: {
              shader: {
                type: Scratch.ArgumentType.STRING,
                menu: "shaders"
              }
            }
          },
          {
            opcode: "isShader",
            blockType: Scratch.BlockType.BOOLEAN,
            text: Scratch.translate({ id: "isShader", default: "Is [shader] shader on screen?" }),
            arguments: {
              shader: {
                type: Scratch.ArgumentType.STRING,
                menu: "shaders"
              }
            },
            disableMonitor: true
          },
          {
            opcode: "shaderList",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate({ id: "shaderList", default: "shader list" }),
            disableMonitor: true
          },
          "---",
          {
            opcode: "setRectClipbox",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate({ id: "setRectClipbox", default: "Set rect clipping x:[x] y:[y] w:[w] h:[h] dir:[dir]" }),
            color1: "#a772e7",
            arguments: {
              x: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              w: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 100
              },
              h: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 100
              },
              dir: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 90
              }
            }
          },
          {
            opcode: "setIRectClipbox",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate({ id: "setIRectClipbox", default: "Set invert rect clipping x:[x] y:[y] w:[w] h:[h] dir:[dir]" }),
            color1: "#a772e7",
            arguments: {
              x: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              w: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 100
              },
              h: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 100
              },
              dir: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 90
              }
            }
          },
          {
            opcode: "setOvalClipbox",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate({ id: "setOvalClipbox", default: "Set oval clipping x:[x] y:[y] w:[w] h:[h] dir:[dir]" }),
            color1: "#a772e7",
            arguments: {
              x: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              w: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 100
              },
              h: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 100
              },
              dir: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 90
              }
            }
          },
          {
            opcode: "setIOvalClipbox",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate({ id: "setIOvalClipbox", default: "Set invert oval clipping x:[x] y:[y] w:[w] h:[h] dir:[dir]" }),
            color1: "#a772e7",
            arguments: {
              x: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              w: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 100
              },
              h: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 100
              },
              dir: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 90
              }
            }
          },
          {
            opcode: "setTriangleClipbox",
            blockType: Scratch.BlockType.COMMAND,
            color1: "#a772e7",
            text: Scratch.translate({ id: "setTriangleClipbox", default: "Set triangle clipping x1:[x1] y1:[y1] x2:[x2] y2:[y2] x3:[x3] y3:[y3] dir:[dir]" }),
            arguments: {
              x1: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              y1: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              x2: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              y2: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 100
              },
              x3: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 100
              },
              y3: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              dir: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 90
              }
            }
          },
          {
            opcode: "setITriangleClipbox",
            blockType: Scratch.BlockType.COMMAND,
            color1: "#a772e7",
            text: Scratch.translate({ id: "setITriangleClipbox", default: "Set invert triangle clipping x1:[x1] y1:[y1] x2:[x2] y2:[y2] x3:[x3] y3:[y3] dir:[dir]" }),
            arguments: {
              x1: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              y1: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              x2: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              y2: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 100
              },
              x3: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 100
              },
              y3: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              dir: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 90
              }
            }
          },
          {
            opcode: "getRectClipboxInfo",
            blockType: Scratch.BlockType.REPORTER,
            color1: "#a772e7",
            text: Scratch.translate({ id: "getRectClipboxInfo", default: "Rect clipping info" }),
            disableMonitor: true
          },
          {
            opcode: "getIRectClipboxInfo",
            blockType: Scratch.BlockType.REPORTER,
            color1: "#a772e7",
            text: Scratch.translate({ id: "getIRectClipboxInfo", default: "Invert rect clipping info" }),
            disableMonitor: true
          },
          {
            opcode: "getOvalClipboxInfo",
            blockType: Scratch.BlockType.REPORTER,
            color1: "#a772e7",
            text: Scratch.translate({ id: "getOvalClipboxInfo", default: "Oval clipping info" }),
            disableMonitor: true
          },
          {
            opcode: "getIOvalClipboxInfo",
            blockType: Scratch.BlockType.REPORTER,
            color1: "#a772e7",
            text: Scratch.translate({ id: "getIOvalClipboxInfo", default: "Invert oval clipping info" }),
            disableMonitor: true
          },
          {
            opcode: "getTriangleClipboxInfo",
            blockType: Scratch.BlockType.REPORTER,
            color1: "#a772e7",
            text: Scratch.translate({ id: "getTriangleClipboxInfo", default: "Triangle clipping info" }),
            disableMonitor: true
          },
          {
            opcode: "getITriangleClipboxInfo",
            blockType: Scratch.BlockType.REPORTER,
            color1: "#a772e7",
            text: Scratch.translate({ id: "getITriangleClipboxInfo", default: "Invert triangle clipping info" }),
            disableMonitor: true
          },
          {
            opcode: "getRectClipboxItem",
            blockType: Scratch.BlockType.REPORTER,
            color1: "#a772e7",
            text: Scratch.translate({ id: "getRectClipboxItem", default: "[item] of rect clipping info [index]" }),
            arguments: {
              item: {
                type: Scratch.ArgumentType.STRING,
                menu: "roProps"
              },
              index: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            },
            disableMonitor: true
          },
          {
            opcode: "getIRectClipboxItem",
            blockType: Scratch.BlockType.REPORTER,
            color1: "#a772e7",
            text: Scratch.translate({ id: "getIRectClipboxItem", default: "[item] of invert rect clipping info [index]" }),
            arguments: {
              item: {
                type: Scratch.ArgumentType.STRING,
                menu: "roProps"
              },
              index: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            },
            disableMonitor: true
          },
          {
            opcode: "getOvalClipboxItem",
            blockType: Scratch.BlockType.REPORTER,
            color1: "#a772e7",
            text: Scratch.translate({ id: "getOvalClipboxItem", default: "[item] of oval clipping info [index]" }),
            arguments: {
              item: {
                type: Scratch.ArgumentType.STRING,
                menu: "roProps"
              },
              index: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            },
            disableMonitor: true
          },
          {
            opcode: "getIOvalClipboxItem",
            blockType: Scratch.BlockType.REPORTER,
            color1: "#a772e7",
            text: Scratch.translate({ id: "getIOvalClipboxItem", default: "[item] of invert oval clipping info [index]" }),
            arguments: {
              item: {
                type: Scratch.ArgumentType.STRING,
                menu: "roProps"
              },
              index: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            },
            disableMonitor: true
          },
          {
            opcode: "getTriangleClipboxItem",
            blockType: Scratch.BlockType.REPORTER,
            color1: "#a772e7",
            text: Scratch.translate({ id: "getTriangleClipboxItem", default: "[item] of triangle clipping info [index]" }),
            arguments: {
              item: {
                type: Scratch.ArgumentType.STRING,
                menu: "triangleProps"
              },
              index: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            },
            disableMonitor: true
          },
          {
            opcode: "getITriangleClipboxItem",
            blockType: Scratch.BlockType.REPORTER,
            color1: "#a772e7",
            text: Scratch.translate({ id: "getITriangleClipboxItem", default: "[item] of invert triangle clipping info [index]" }),
            arguments: {
              item: {
                type: Scratch.ArgumentType.STRING,
                menu: "triangleProps"
              },
              index: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            },
            disableMonitor: true
          },
          {
            opcode: "clearClipbox",
            color1: "#a772e7",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate({ id: "clearClipbox", default: "Clear clipping on myself" })
          },
          "---",
          {
            opcode: "setBlend",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate({ id: "setBlend", default: "use [blend] blending" }),
            arguments: {
              blend: {
                type: Scratch.ArgumentType.STRING,
                menu: "blendModes"
              }
            }
          },
          {
            opcode: "getBlend", 
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate({ id: "getBlend", default: "Blending" }),
            disableMonitor: true
          },
          "---",
          {
            opcode: "turnSetting",
            color1: "#a772e7",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate({ id: "turnSetting", default: "Turn [setting] [state]" }),
            arguments: {
              setting: {
                type: Scratch.ArgumentType.STRING,
                menu: "settings"
              },
              state: {
                type: Scratch.ArgumentType.STRING,
                menu: "states"
              }
            }
          },
          {
            opcode: "isSetting",
            color1: "#a772e7",
            blockType: Scratch.BlockType.BOOLEAN,
            text: Scratch.translate({ id: "isSetting", default: "Is [setting] enabled?" }),
            arguments: {
              setting: {
                type: Scratch.ArgumentType.STRING,
                menu: "settings"
              }
            },
            disableMonitor: true
          },
          {
            opcode: "getDescrepency",
            color1: "#a772e7",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate({ id: "getDescrepency", default: "Scale multiplier of the [dimension]" }),
            arguments: {
              dimension: {
                type: Scratch.ArgumentType.STRING,
                menu: "dimensions"
              }
            },
            disableMonitor: true
          },
          {
            opcode: "supportsGlslThree",
            color1: "#a772e7",
            blockType: Scratch.BlockType.BOOLEAN,
            text: Scratch.translate({ id: "supportsGlslThree", default: "Supports glsl 3.0?" }),
            disableMonitor: true
          }
        ],
        menus: {
          shaders:
          {
            acceptReporters: true,
            items: "getShaders"
          },
          roProps:
          {
            acceptReporters: true,
            items: ["x", "y", "w", "h", "dir"]
          },
          triangleProps:
          {
            acceptReporters: true,
            items: ["x1", "y1", "x2", "y2", "x3", "y3", "dir"]
          },
          blendModes:
          {
            acceptReporters: true,
            items: [
              { text: Scratch.translate({ id: "default", default: "default" }), value: "default" },
              { text: Scratch.translate({ id: "default behind", default: "default behind" }), value: "default behind" },
              { text: Scratch.translate({ id: "additive", default: "additive" }), value: "additive" },
              { text: Scratch.translate({ id: "additive with alpha", default: "additive with alpha" }), value: "additive with alpha" },
              { text: Scratch.translate({ id: "subtract", default: "subtract" }), value: "subtract" },
              { text: Scratch.translate({ id: "subtract with alpha", default: "subtract with alpha" }), value: "subtract with alpha" },
              { text: Scratch.translate({ id: "multiply", default: "multiply" }), value: "multiply" },
              { text: Scratch.translate({ id: "invert", default: "invert" }), value: "invert" },
              { text: Scratch.translate({ id: "mask", default: "mask" }), value: "mask" },
              { text: Scratch.translate({ id: "erase", default: "erase" }), value: "erase" }
            ]
          },
          settings:
          {
            acceptReporters: true,
            items: [
              { text: Scratch.translate({ id: "rectClip", default: "rect clipping" }), value: "rectClip" },
              { text: Scratch.translate({ id: "iRectClip", default: "invert rect clipping" }), value: "iRectClip" },
              { text: Scratch.translate({ id: "ovalClip", default: "oval clipping" }), value: "ovalClip" },
              { text: Scratch.translate({ id: "iOvalClip", default: "invert oval clipping" }), value: "iOvalClip" },
              { text: Scratch.translate({ id: "triangleClip", default: "triangle clipping" }), value: "triangleClip" },
              { text: Scratch.translate({ id: "iTriangleClip", default: "invert triangle clipping" }), value: "iTriangleClip" },
              { text: Scratch.translate({ id: "autoRerender", default: "auto re-render" }), value: "autoRerender" },
              { text: Scratch.translate({ id: "multiRender", default: "multi render" }), value: "multiRender" }
            ]
          },
          states:
          {
            acceptReporters: true,
            items: [
              { text: Scratch.translate({ id: "on", default: "on" }), value: "on" },
              { text: Scratch.translate({ id: "off", default: "off" }), value: "off" }
            ]
          },
          dimensions:
          {
            acceptReporters: true,
            items: [
              { text: Scratch.translate({ id: "width", default: "width" }), value: "width" },
              { text: Scratch.translate({ id: "height", default: "height" }), value: "height" }
            ]
          }
        }
      }
    }

    getShaders()
    {
      return penPlus ? ["", ...Object.keys(penPlus.shaders)] : [""];
    }
    setShader({ shader })
    {
      if (shader === "" || !penPlus) {
        currentShader = [];
        return;
      }
      if (!penPlus.shaders[shader]) return;
      if (currentShader.includes(shader)) return;
      if (multiRender) currentShader.push(shader);
      else currentShader = [shader];
      renderer.dirty = true;
    }
    isShader({ shader })
    {
      return currentShader.includes(shader);
    }
    shaderList()
    {
      return currentShader;
    }

    setRectClipbox({ x, y, w, h, dir }, util)
    {
      const target = util.target;
      const drawable = renderer._allDrawables[target.drawableID];
      if (!drawable) return;
      pushClipbox(drawable, "rClipbox", "rClipboxes", { x: cast.toNumber(x), y: cast.toNumber(y), w: cast.toNumber(w), h: cast.toNumber(h), dir: cast.toNumber(dir) }, defaultRectClipbox, hasRectClipbox);
      if (target.visible) {
        renderer.dirty = true;
        target.emitVisualChange();
        target.runtime.requestRedraw();
        target.runtime.requestTargetsUpdate(target);
      }
    }
    setIRectClipbox({ x, y, w, h, dir }, util)
    {
      const target = util.target;
      const drawable = renderer._allDrawables[target.drawableID];
      if (!drawable) return;
      pushClipbox(drawable, "irClipbox", "irClipboxes", { x: cast.toNumber(x), y: cast.toNumber(y), w: cast.toNumber(w), h: cast.toNumber(h), dir: cast.toNumber(dir) }, defaultRectClipbox, hasRectClipbox);
      if (target.visible) {
        renderer.dirty = true;
        target.emitVisualChange();
        target.runtime.requestRedraw();
        target.runtime.requestTargetsUpdate(target);
      }
    }
    setOvalClipbox({ x, y, w, h, dir }, util)
    {
      const target = util.target;
      const drawable = renderer._allDrawables[target.drawableID];
      if (!drawable) return;
      pushClipbox(drawable, "oClipbox", "oClipboxes", { x: cast.toNumber(x), y: cast.toNumber(y), w: cast.toNumber(w), h: cast.toNumber(h), dir: cast.toNumber(dir) }, defaultRectClipbox, hasRectClipbox);
      if (target.visible) {
        renderer.dirty = true;
        target.emitVisualChange();
        target.runtime.requestRedraw();
        target.runtime.requestTargetsUpdate(target);
      }
    }
    setIOvalClipbox({ x, y, w, h, dir }, util)
    {
      const target = util.target;
      const drawable = renderer._allDrawables[target.drawableID];
      if (!drawable) return;
      pushClipbox(drawable, "ioClipbox", "ioClipboxes", { x: cast.toNumber(x), y: cast.toNumber(y), w: cast.toNumber(w), h: cast.toNumber(h), dir: cast.toNumber(dir) }, defaultRectClipbox, hasRectClipbox);
      if (target.visible) {
        renderer.dirty = true;
        target.emitVisualChange();
        target.runtime.requestRedraw();
        target.runtime.requestTargetsUpdate(target);
      }
    }
    setTriangleClipbox({ x1, y1, x2, y2, x3, y3, dir }, util)
    {
      const target = util.target;
      const drawable = renderer._allDrawables[target.drawableID];
      if (!drawable) return;
      pushClipbox(drawable, "tClipbox", "tClipboxes", {
        x1: cast.toNumber(x1),
        y1: cast.toNumber(y1),
        x2: cast.toNumber(x2),
        y2: cast.toNumber(y2),
        x3: cast.toNumber(x3),
        y3: cast.toNumber(y3),
        dir: cast.toNumber(dir)
      }, defaultTriangleClipbox, hasTriangleClipbox);
      if (target.visible) {
        renderer.dirty = true;
        target.emitVisualChange();
        target.runtime.requestRedraw();
        target.runtime.requestTargetsUpdate(target);
      }
    }
    setITriangleClipbox({ x1, y1, x2, y2, x3, y3, dir }, util)
    {
      const target = util.target;
      const drawable = renderer._allDrawables[target.drawableID];
      if (!drawable) return;
      pushClipbox(drawable, "itClipbox", "itClipboxes", {
        x1: cast.toNumber(x1),
        y1: cast.toNumber(y1),
        x2: cast.toNumber(x2),
        y2: cast.toNumber(y2),
        x3: cast.toNumber(x3),
        y3: cast.toNumber(y3),
        dir: cast.toNumber(dir)
      }, defaultTriangleClipbox, hasTriangleClipbox);
      if (target.visible) {
        renderer.dirty = true;
        target.emitVisualChange();
        target.runtime.requestRedraw();
        target.runtime.requestTargetsUpdate(target);
      }
    }
    getRectClipboxInfo(args, util)
    {
      const drawable = renderer._allDrawables[util.target.drawableID];
      if (!drawable) return "[]";
      if (drawable.rClipbox === undefined) drawable.rClipbox = defaultRectClipbox();
      const stack = getActiveClipStack(drawable, "rClipbox", "rClipboxes", defaultRectClipbox, hasRectClipbox);
      return JSON.stringify(stack);
    }
    getIRectClipboxInfo(args, util)
    {
      const drawable = renderer._allDrawables[util.target.drawableID];
      if (!drawable) return "[]";
      if (drawable.irClipbox === undefined) drawable.irClipbox = defaultRectClipbox();
      const stack = getActiveClipStack(drawable, "irClipbox", "irClipboxes", defaultRectClipbox, hasRectClipbox);
      return JSON.stringify(stack);
    }
    getOvalClipboxInfo(args, util)
    {
      const drawable = renderer._allDrawables[util.target.drawableID];
      if (!drawable) return "[]";
      if (drawable.oClipbox === undefined) drawable.oClipbox = defaultRectClipbox();
      const stack = getActiveClipStack(drawable, "oClipbox", "oClipboxes", defaultRectClipbox, hasRectClipbox);
      return JSON.stringify(stack);
    }
    getIOvalClipboxInfo(args, util)
    {
      const drawable = renderer._allDrawables[util.target.drawableID];
      if (!drawable) return "[]";
      if (drawable.ioClipbox === undefined) drawable.ioClipbox = defaultRectClipbox();
      const stack = getActiveClipStack(drawable, "ioClipbox", "ioClipboxes", defaultRectClipbox, hasRectClipbox);
      return JSON.stringify(stack);
    }
    getTriangleClipboxInfo(args, util)
    {
      const drawable = renderer._allDrawables[util.target.drawableID];
      if (!drawable) return "[]";
      if (drawable.tClipbox === undefined) drawable.tClipbox = defaultTriangleClipbox();
      const stack = getActiveClipStack(drawable, "tClipbox", "tClipboxes", defaultTriangleClipbox, hasTriangleClipbox);
      return JSON.stringify(stack);
    }
    getITriangleClipboxInfo(args, util)
    {
      const drawable = renderer._allDrawables[util.target.drawableID];
      if (!drawable) return "[]";
      if (drawable.itClipbox === undefined) drawable.itClipbox = defaultTriangleClipbox();
      const stack = getActiveClipStack(drawable, "itClipbox", "itClipboxes", defaultTriangleClipbox, hasTriangleClipbox);
      return JSON.stringify(stack);
    }
    getRectClipboxItem({ item, index }, util)
    {
      const drawable = renderer._allDrawables[util.target.drawableID];
      if (!drawable) return "";
      if (drawable.rClipbox === undefined) drawable.rClipbox = defaultRectClipbox();
      const stack = getActiveClipStack(drawable, "rClipbox", "rClipboxes", defaultRectClipbox, hasRectClipbox);
      const clip = stack[Math.max(0, Math.min(stack.length - 1, Math.round(index) - 1))];
      return clip ? clip[item] ?? "" : "";
    }
    getIRectClipboxItem({ item, index }, util)
    {
      const drawable = renderer._allDrawables[util.target.drawableID];
      if (!drawable) return "";
      if (drawable.irClipbox === undefined) drawable.irClipbox = defaultRectClipbox();
      const stack = getActiveClipStack(drawable, "irClipbox", "irClipboxes", defaultRectClipbox, hasRectClipbox);
      const clip = stack[Math.max(0, Math.min(stack.length - 1, Math.round(index) - 1))];
      return clip ? clip[item] ?? "" : "";
    }
    getOvalClipboxItem({ item, index }, util)
    {
      const drawable = renderer._allDrawables[util.target.drawableID];
      if (!drawable) return "";
      if (drawable.oClipbox === undefined) drawable.oClipbox = defaultRectClipbox();
      const stack = getActiveClipStack(drawable, "oClipbox", "oClipboxes", defaultRectClipbox, hasRectClipbox);
      const clip = stack[Math.max(0, Math.min(stack.length - 1, Math.round(index) - 1))];
      return clip ? clip[item] ?? "" : "";
    }
    getIOvalClipboxItem({ item, index }, util)
    {
      const drawable = renderer._allDrawables[util.target.drawableID];
      if (!drawable) return "";
      if (drawable.ioClipbox === undefined) drawable.ioClipbox = defaultRectClipbox();
      const stack = getActiveClipStack(drawable, "ioClipbox", "ioClipboxes", defaultRectClipbox, hasRectClipbox);
      const clip = stack[Math.max(0, Math.min(stack.length - 1, Math.round(index) - 1))];
      return clip ? clip[item] ?? "" : "";
    }
    getTriangleClipboxItem({ item, index }, util)
    {
      const drawable = renderer._allDrawables[util.target.drawableID];
      if (!drawable) return "";
      if (drawable.tClipbox === undefined) drawable.tClipbox = defaultTriangleClipbox();
      const stack = getActiveClipStack(drawable, "tClipbox", "tClipboxes", defaultTriangleClipbox, hasTriangleClipbox);
      const clip = stack[Math.max(0, Math.min(stack.length - 1, Math.round(index) - 1))];
      return clip ? clip[item] ?? "" : "";
    }
    getITriangleClipboxItem({ item, index }, util)
    {
      const drawable = renderer._allDrawables[util.target.drawableID];
      if (!drawable) return "";
      if (drawable.itClipbox === undefined) drawable.itClipbox = defaultTriangleClipbox();
      const stack = getActiveClipStack(drawable, "itClipbox", "itClipboxes", defaultTriangleClipbox, hasTriangleClipbox);
      const clip = stack[Math.max(0, Math.min(stack.length - 1, Math.round(index) - 1))];
      return clip ? clip[item] ?? "" : "";
    }
    getClipboxItem({ item, info })
    {
      try {
        const clipboxData = JSON.parse(info);
        if (Array.isArray(clipboxData)) {
          return clipboxData[0]?.[item] ?? "";
        }
        return clipboxData[item] ?? "";
      } catch (e) {
        return "";
      }
    }
    clearClipbox({}, util)
    {
      const target = util.target;
      const drawable = renderer._allDrawables[target.drawableID];
      if (!drawable) return;
      drawable.rClip = false;
      drawable.irClip = false;
      drawable.oClip = false;
      drawable.ioClip = false;
      drawable.tClip = false;
      drawable.itClip = false;
      drawable.rClipboxes = [];
      drawable.irClipboxes = [];
      drawable.oClipboxes = [];
      drawable.ioClipboxes = [];
      drawable.tClipboxes = [];
      drawable.itClipboxes = [];
      drawable.rClipbox = defaultRectClipbox();
      drawable.irClipbox = defaultRectClipbox();
      drawable.oClipbox = defaultRectClipbox();
      drawable.ioClipbox = defaultRectClipbox();
      drawable.tClipbox = defaultTriangleClipbox();
      drawable.itClipbox = defaultTriangleClipbox();
      if (target.visible) {
        renderer.dirty = true;
        target.emitVisualChange();
        target.runtime.requestRedraw();
        target.runtime.requestTargetsUpdate(target);
      }
    }
    setBlend({ blend }, util)
    {
      const target = util.target;
      const drawable = renderer._allDrawables[target.drawableID];
      
      if (!drawable) return;
      drawable.blendMode = blend;
      if (target.visible) {
        renderer.dirty = true;
        target.emitVisualChange();
        target.runtime.requestRedraw();
        target.runtime.requestTargetsUpdate(target);
      }
    }
    getBlend({}, util)
    {
      const drawable = renderer._allDrawables[util.target.drawableID];
      return drawable ? drawable.blendMode : "";
    }
    turnSetting({ setting, state }, util)
    {
      const target = util.target;
      const drawable = renderer._allDrawables[target.drawableID];
      if (!drawable) return;
      const on = (state === "on");
      switch (setting)
      {
        case "rectClip":
          drawable.rClip = on;
          break;
        case "iRectClip":
          drawable.irClip = on;
          break;
        case "ovalClip":
          drawable.oClip = on;
          break;
        case "iOvalClip":
          drawable.ioClip = on;
          break;
        case "triangleClip":
          drawable.tClip = on;
          break;
        case "iTriangleClip":
          drawable.itClip = on;
          break;
        case "autoRerender":
          autoRerender = on;
          break;
        case "multiRender":
          multiRender = on;
          break;
      }
      if (target.visible) {
        renderer.dirty = true;
        target.emitVisualChange();
        target.runtime.requestRedraw();
        target.runtime.requestTargetsUpdate(target);
      }
    }
    isSetting({ setting }, util)
    {
      const drawable = renderer._allDrawables[util.target.drawableID];
      if (!drawable) return false;
      switch (setting)
      {
        case "rectClip": return drawable.rClip;
        case "iRectClip": return drawable.irClip;
        case "ovalClip": return drawable.oClip;
        case "iOvalClip": return drawable.ioClip;
        case "triangleClip": return drawable.tClip;
        case "iTriangleClip": return drawable.itClip;
        case "autoRerender": return autoRerender;
        case "multiRender": return multiRender;
      }
      return false;
    }
    getDescrepency({ dimension })
    {
      return (dimension === "width" ?
        gl.canvas.width / renderer._nativeSize[0] :
        gl.canvas.height / renderer._nativeSize[1]);
    }
    supportsGlslThree()
    {
      return twgl.isWebGL2(gl);
    }
  }
  // Post All-in-one class saved to local module variable.
  postAIOClass = Extension;
})(Scratch);

//Looks-Expanded
(function (Scratch) {
  "use strict";

  const menuIconURI =
"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI5Ny43MzkiIGhlaWdodD0iOTcuNzM5IiB2aWV3Qm94PSIwIDAgOTcuNzM5IDk3LjczOSI+PGcgc3Ryb2tlLW1pdGVybGltaXQ9IjEwIj48cGF0aCBkPSJNMCA0OC44N0MwIDIxLjg4IDIxLjg4IDAgNDguODcgMHM0OC44NyAyMS44OCA0OC44NyA0OC44Ny0yMS44OCA0OC44Ny00OC44NyA0OC44N1MwIDc1Ljg2IDAgNDguODciIGZpbGw9IiM2MzQyYTYiLz48cGF0aCBkPSJNNS43ODIgNDguODdjMC0yMy43OTcgMTkuMjkxLTQzLjA4OCA0My4wODgtNDMuMDg4UzkxLjk1OCAyNS4wNzMgOTEuOTU4IDQ4Ljg3IDcyLjY2NyA5MS45NTggNDguODcgOTEuOTU4IDUuNzgyIDcyLjY2NyA1Ljc4MiA0OC44NyIgZmlsbD0iIzk2ZiIvPjxwYXRoIGQ9Ik0xNi4xODYgNDQuOTk2YzQuNTMyLTUuMzEgMTYuMjE4LTE2Ljg3NCAzMi4xNzYtMTcuMDM0IDE3LjExNy0uMTcyIDI5LjMzNCAxMi41MzkgMzMuNTIgMTcuNjA0IDEuMDM5IDEuMjU4IDEuMSAyLjc2NC4xNjcgMy45MjctMy45MzUgNC45MDEtMTUuODk4IDE3LjY4Mi0zMy42ODcgMTcuNzY3LTE2Ljk1Ni4wOC0yOC43My0xMi41OS0zMi43MzYtMTcuNjI0LS45OTMtMS4yNDctLjc5My0zLjA1NC41Ni00LjY0IiBmaWxsPSIjZmZmIi8+PHBhdGggZD0iTTM1LjE0NiA0Ny42MWMwLTcuNTM2IDYuMTEtMTMuNjQ1IDEzLjY0NS0xMy42NDUgNy41MzYgMCAxMy42NDUgNi4xMSAxMy42NDUgMTMuNjQ1IDAgNy41MzYtNi4xMSAxMy42NDUtMTMuNjQ1IDEzLjY0NS03LjUzNiAwLTEzLjY0NS02LjExLTEzLjY0NS0xMy42NDUiIGZpbGw9IiM5NmYiLz48cGF0aCBkPSJNNDEuMzQyIDQ3LjYxYTcuNDQ5IDcuNDQ5IDAgMSAxIDE0Ljg5OCAwIDcuNDQ5IDcuNDQ5IDAgMCAxLTE0Ljg5OCAwIiBmaWxsPSIjZmZmIi8+PHBhdGggZD0iTTY1LjY1IDc4Ljc5YTIuOTIgMi45MiAwIDAgMS0yLjkxOC0yLjkydi02LjcxMmgtNi43MTNhMi45MiAyLjkyIDAgMCAxLTIuOTE5LTIuOTE5VjY0LjA1YTIuOTIgMi45MiAwIDAgMSAyLjkxOS0yLjkxOGg2LjcxM3YtNi43MTNBMi45MiAyLjkyIDAgMCAxIDY1LjY1IDUxLjVoMi4xOWEyLjkyIDIuOTIgMCAwIDEgMi45MTggMi45MTl2Ni43MTNoNi43MTNhMi45MiAyLjkyIDAgMCAxIDIuOTE5IDIuOTE4djIuMTlhMi45MiAyLjkyIDAgMCAxLTIuOTIgMi45MThoLTYuNzEydjYuNzEzYTIuOTIgMi45MiAwIDAgMS0yLjkxOSAyLjkxOXoiIGZpbGw9IiNmZmYiIHN0cm9rZT0iIzk2ZiIgc3Ryb2tlLXdpZHRoPSI4Ii8+PHBhdGggZD0iTTY1LjY1IDc4Ljc5YTIuOTIgMi45MiAwIDAgMS0yLjkxOC0yLjkydi02LjcxMmgtNi43MTNhMi45MiAyLjkyIDAgMCAxLTIuOTE5LTIuOTE5VjY0LjA1YTIuOTIgMi45MiAwIDAgMSAyLjkxOS0yLjkxOGg2LjcxM3YtNi43MTNBMi45MiAyLjkyIDAgMCAxIDY1LjY1IDUxLjVoMi4xOWEyLjkyIDIuOTIgMCAwIDEgMi45MTggMi45MTl2Ni43MTNoNi43MTNhMi45MiAyLjkyIDAgMCAxIDIuOTE5IDIuOTE4djIuMTlhMi45MiAyLjkyIDAgMCAxLTIuOTIgMi45MThoLTYuNzEydjYuNzEzYTIuOTIgMi45MiAwIDAgMS0yLjkxOSAyLjkxOXoiIGZpbGw9IiNmZmYiLz48L2c+PC9zdmc+";

  const vm = Scratch.vm || {};
  const Cast = Scratch.Cast;
  const runtime = vm.runtime || {};
  const looksCore = runtime.ext_scratch3_looks || {};
  const isPM = Scratch.extensions.isPenguinMod;

  const render = vm.renderer || {};
  const twgl = (render.exports && render.exports.twgl) || {};

  const drawableKey = Symbol("SPlooksKey");
  const MAX_REPLACERS = 15;

  const newSingleEffects = {
    saturation: 1, opaque: 0, contrast: 1,
    posterize: 0, sepia: 0, bloom: 0
  };
  const genEffectFactory = () => {
    return {
      warp: [0.5, -0.5, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5],
      tint: [1, 1, 1, 1],
      replacers: [],
      maskTexture: "",
      oldMask: "",
      shouldMask: 0,
      newEffects: { ...newSingleEffects }
    };
  };

  const defaultWarpCache = "0.5,-0.5,-0.5,-0.5,-0.5,0.5,0.5,0.5";
  const replaceFrom = new Float32Array(MAX_REPLACERS * 3).fill(0);
  const replaceTo = new Float32Array(MAX_REPLACERS * 4).fill(0);
  const replaceThresh = new Float32Array(MAX_REPLACERS).fill(1);

  /* patch for new effects */
  function initDrawable(drawable) {
    if (!drawable[drawableKey]) drawable[drawableKey] = genEffectFactory();
  }

  // Clear the renderer's shader cache since we're patching shaders
  for (const cache of Object.values(render._shaderManager._shaderCache)) {
    for (const programInfo of cache) {
      if (programInfo) render.gl.deleteProgram(programInfo.program);
    }
    cache.length = 0;
  }

  let patchShaders = false;
  const ogCreateProgramInfo = twgl.createProgramInfo;
  twgl.createProgramInfo = function (...args) {
    // perform a string find-and-replace on the shader text
    if (patchShaders && args[1] && args[1][0] && args[1][1]) {
      args[1][0] = args[1][0]
        // replace attribute properties with variables we can modify
        .replaceAll("vec4(a_position", "vec4(positionSP")
        .replace("v_texCoord = a_texCoord;", "")
        .replace("#if !(defined(DRAW_MODE_line) || defined(DRAW_MODE_background))", "#if 1")
        .replace(`void main() {`,
        `uniform vec2 u_warpSP[4];

void main() {
  vec2 positionSP = a_position;
  #ifndef DRAW_MODE_background
  v_texCoord = a_texCoord;
  #endif

  float u = v_texCoord.x;
  float v = v_texCoord.y;

  // apply position warp (bilinear)
  vec2 warpedPos = 
    (1.0 - u) * (1.0 - v) * u_warpSP[0] + u * (1.0 - v) * u_warpSP[1] +
    u * v * u_warpSP[2] + (1.0 - u) * v * u_warpSP[3];

  // compute w for perspective correction
  float w = (1.0 - u) * (1.0 - v) + u * (1.0 - v) + u * v + (1.0 - u) * v;

  positionSP = warpedPos / max(w, 1e-5);

  #ifdef DRAW_MODE_background
  gl_Position = vec4(positionSP * 2.0, 0, 1);
  #else
  gl_Position = u_projectionMatrix * u_modelMatrix * vec4(positionSP, 0, 1);
  #endif`
      );
      if (isPM) {
        // penguinmod has skewing, which we have to disable for warping to work
        args[1][0] = args[1][0].replace(
          `gl_Position = u_projectionMatrix * u_modelMatrix * vec4(x,y, 0, 1);`,
          `gl_Position = u_projectionMatrix * u_modelMatrix * vec4(positionSP, 0, 1);`
        );
      }

      args[1][1] = args[1][1].replace(
        `uniform sampler2D u_skin;`,
        `uniform sampler2D u_skin;
uniform sampler2D u_maskTextureSP;
uniform float u_shouldMaskSP;

#define MAX_REPLACERS 15
uniform vec3 u_replaceColorFromSP[MAX_REPLACERS];
uniform vec4 u_replaceColorToSP[MAX_REPLACERS];
uniform float u_replaceThresholdSP[MAX_REPLACERS];
uniform int u_numReplacersSP;

uniform vec4 u_tintColorSP;
uniform float u_saturateSP;
uniform float u_opaqueSP;
uniform float u_contrastSP;
uniform float u_posterizeSP;
uniform float u_sepiaSP;
uniform float u_bloomSP;

vec3 spRGB2HSV(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 spHSV2RGB(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}`
      ).replace(
        `gl_FragColor.rgb = clamp(gl_FragColor.rgb / (gl_FragColor.a + epsilon), 0.0, 1.0);`,
        `gl_FragColor.rgb = clamp(gl_FragColor.rgb / (gl_FragColor.a + epsilon), 0.0, 1.0);
vec3 finalColor = gl_FragColor.rgb;
float finalAlpha = gl_FragColor.a;

if (u_shouldMaskSP > 0.5 && finalAlpha > 0.0) {
  vec4 maskColor = texture2D(u_maskTextureSP, texcoord0);
  maskColor.rgb = clamp(maskColor.rgb / (maskColor.a + epsilon), 0.0, 1.0);
  finalAlpha *= maskColor.a;
}

if (u_numReplacersSP > 0) for (int i = 0; i < MAX_REPLACERS; i++) {
  if (i >= u_numReplacersSP) break;

  float dist = distance(finalColor, u_replaceColorFromSP[i]);
  if (dist <= u_replaceThresholdSP[i]) {
    float strength = 1.0 - (dist / (u_replaceThresholdSP[i] + 1.0));
    finalColor = mix(finalColor, u_replaceColorToSP[i].rgb, strength);
    if (u_replaceColorToSP[i].a < 1.0 && strength > 0.01) {
      finalAlpha = clamp(mix(finalAlpha, u_replaceColorToSP[i].a, strength), 0.0, 1.0);
    }
  }
}


if (u_saturateSP > 1.0 || u_saturateSP < 1.0) {
  vec3 hsv = spRGB2HSV(finalColor);
  if (u_saturateSP < 0.0) {
    hsv.x = mod(hsv.x + 0.5, 1.0);
    hsv.y *= -u_saturateSP;
  } else {
    hsv.y *= u_saturateSP;
  }
  finalColor = spHSV2RGB(hsv);
}
finalColor = (finalColor - 0.5) * u_contrastSP + 0.5;
if (u_posterizeSP > 0.0) finalColor = floor(finalColor * u_posterizeSP) / u_posterizeSP;

if (u_sepiaSP > 0.0) {
  vec3 sepiaColor = vec3(
    dot(finalColor, vec3(0.393, 0.769, 0.189)),
    dot(finalColor, vec3(0.349, 0.686, 0.168)),
    dot(finalColor, vec3(0.272, 0.534, 0.131))
  );
  finalColor = mix(finalColor, sepiaColor, u_sepiaSP);
}
if (u_bloomSP > 0.0) {
  vec3 bloom = max(finalColor - 0.4, 0.0);

  bloom += texture2D(u_skin, v_texCoord + vec2( 0.001,  0.001)).rgb;
  bloom += texture2D(u_skin, v_texCoord + vec2(-0.001,  0.001)).rgb;
  bloom += texture2D(u_skin, v_texCoord + vec2( 0.001, -0.001)).rgb;
  bloom += texture2D(u_skin, v_texCoord + vec2(-0.001, -0.001)).rgb;
  bloom *= 0.25;

  finalColor += bloom * u_bloomSP;
  finalColor = clamp(finalColor, 0.0, 1.0);
}

gl_FragColor.rgb = finalColor * u_tintColorSP.rgb;
float baseAlpha = finalAlpha;
if (baseAlpha > 0.0 && baseAlpha < 1.0) baseAlpha = mix(baseAlpha, 1.0, u_opaqueSP);
gl_FragColor.a = baseAlpha;`
      ).replaceAll(
        // The unpremultiply code will now always run due to palette replacement stuff.
        // This is a bit more inefficient, but whatever.
        "#if defined(ENABLE_color) || defined(ENABLE_brightness)",
        // i have no idea how webgl works, and i don"t want to have to remove the #endif somehow
        // just do something that will always be true -CST
        "#if defined(MAX_REPLACERS)"
      );
    }
    return ogCreateProgramInfo.apply(this, args);
  };
  const ogBuildShader = render._shaderManager._buildShader;
  render._shaderManager._buildShader = function (...args) {
    try {
      patchShaders = true;
      return ogBuildShader.apply(this, args);
    } finally {
      patchShaders = false;
    }
  };

  const ogGetUniforms = render.exports.Drawable.prototype.getUniforms;
  render.exports.Drawable.prototype.getUniforms = function () {
    const gl = render.gl;
    const uniforms = ogGetUniforms.call(this);

    initDrawable(this);
    const effectData = this[drawableKey];
    const replacers = effectData.replacers;

    if (replacers.length > 0) {
      for (let i = 0; i < Math.min(replacers.length, MAX_REPLACERS); i++) {
        replaceFrom.set(replacers[i].targetVert, i * 3);
        replaceTo.set(replacers[i].replaceVert, i * 4);
        replaceThresh[i] = replacers[i].soft;
      }
    }

    const newEffects = effectData.newEffects;
    uniforms.u_replaceColorFromSP = replaceFrom;
    uniforms.u_replaceColorToSP = replaceTo;
    uniforms.u_replaceThresholdSP = replaceThresh;
    uniforms.u_numReplacersSP = replacers ? Math.min(replacers.length, MAX_REPLACERS) : 0;
    uniforms.u_tintColorSP = effectData.tint;
    uniforms.u_warpSP = effectData.warp;
    uniforms.u_shouldMaskSP = effectData.shouldMask;
    uniforms.u_saturateSP = newEffects.saturation;
    uniforms.u_opaqueSP = newEffects.opaque;
    uniforms.u_contrastSP = newEffects.contrast;
    uniforms.u_posterizeSP = newEffects.posterize;
    uniforms.u_sepiaSP = newEffects.sepia;
    uniforms.u_bloomSP = newEffects.bloom;

    if (effectData.shouldMask) {
      uniforms["u_maskTextureSP"] = effectData._maskTexture;
    }

    return uniforms;
  }

  // reset on stop/start/clear
  const ogClearEffects = vm.exports.RenderedTarget.prototype.clearEffects;
  vm.exports.RenderedTarget.prototype.clearEffects = function () {
    const drawable = render._allDrawables[this.drawableID];
    drawable[drawableKey] = genEffectFactory();
    ogClearEffects.call(this);
  };

  // manipulate bounds for warping
  const radianConverter = Math.PI / 180;
  function rotatePoint(x, y, cx, cy, rads) {
    const cos = Math.cos(rads), sin = Math.sin(rads);
    const dx = x - cx, dy = y - cy;
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos
    };
  }
  function warpBounds(drawable, bounds) {
    if (!drawable[drawableKey]) return bounds;

    let warpVals = drawable[drawableKey].warp;
    if (warpVals.join(",") === defaultWarpCache) return bounds;

    // original getBounds already accounts for rotation, so we have to make our own system
    // for getting the non-rotated scale and position
    warpVals = warpVals.map((v, i) => i > 0 && i < 5 ? v * -1 : v);
    const angle = (drawable._direction - 90) * radianConverter;
    const [x, y] = drawable._position;
    const width = drawable.skin.size[0] * (drawable.scale[0] / 200);
    const height = drawable.skin.size[1] * (drawable.scale[1] / 200);

    const points = [
      { x: (warpVals[0] * 2) * -width + x, y: (warpVals[1] * -2) * height - y },
      { x: (warpVals[2] * 2) * width + x, y: (warpVals[3] * -2) * height - y },
      { x: (warpVals[4] * 2) * width + x, y: (warpVals[5] * -2) * -height - y },
      { x: (warpVals[6] * 2) * -width + x, y: (warpVals[7] * -2) * -height - y }
    ];

    const rotatedPoints = points.map(p => rotatePoint(p.x, p.y, x, -y, angle));
    const xs = rotatedPoints.map(p => p.x);
    const ys = rotatedPoints.map(p => p.y);

    bounds.left = Math.min(...xs);
    bounds.top = -Math.min(...ys);
    bounds.right = Math.max(...xs);
    bounds.bottom = -Math.max(...ys);
    return bounds;
  }

  const ogGetBounds = render.exports.Drawable.prototype.getBounds;
  render.exports.Drawable.prototype.getBounds = function() {
    return warpBounds(this, ogGetBounds.call(this));
  };
  const ogGetAABB = render.exports.Drawable.prototype.getAABB;
  render.exports.Drawable.prototype.getAABB = function() {
    return warpBounds(this, ogGetAABB.call(this));
  };

  // update the pen shader
  if (runtime.ext_pen && runtime.ext_pen._penSkinId > -1) {
    const penSkin = render._allSkins[runtime.ext_pen._penSkinId];
    const gl = render.gl;
    penSkin._lineShader = render._shaderManager.getShader("line", 0);
    penSkin._drawTextureShader = render._shaderManager.getShader("default", 0);
    penSkin.a_position_loc = gl.getAttribLocation(penSkin._lineShader.program, "a_position");
    penSkin.a_lineColor_loc = gl.getAttribLocation(penSkin._lineShader.program, "a_lineColor");
    penSkin.a_lineThicknessAndLength_loc = gl.getAttribLocation(penSkin._lineShader.program, "a_lineThicknessAndLength");
    penSkin.a_penPoints_loc = gl.getAttribLocation(penSkin._lineShader.program, "a_penPoints");
  }

  // this will allow clones to inherit parent effects
  const ogInitDrawable = vm.exports.RenderedTarget.prototype.initDrawable;
  vm.exports.RenderedTarget.prototype.initDrawable = function(layerGroup) {
    ogInitDrawable.call(this, layerGroup);
    if (this.isOriginal) return;
 
    const parentSprite = this.sprite.clones[0]; // clone[0] is always the original
    const parentDrawable = render._allDrawables[parentSprite.drawableID];
    const parentEffects = parentDrawable[drawableKey];
    if (!parentEffects) return;

    const drawable = render._allDrawables[this.drawableID];
    const effects = genEffectFactory();
    effects.maskTexture = parentEffects.maskTexture;
    effects.oldMask = parentEffects.oldMask;
    effects.shouldMask = parentEffects.shouldMask;
    effects.warp = [...parentEffects.warp];
    effects.tint = [...parentEffects.tint];
    effects.newEffects = { ...parentEffects.newEffects };
    drawable[drawableKey] = effects;
  };

  /* patch for "when costume switches" event */
  const ogSetCoreCostume = looksCore.constructor.prototype._setCostume;
  ogSetCoreCostume.constructor.prototype._setCostume = function (target, requestedCostume, optZeroIndex) {
    ogSetCoreCostume.call(this, target, requestedCostume, optZeroIndex);
    runtime.startHats(
      "SPlooksExpanded_whenCostumeSwitch",
      { COSTUME: target.getCurrentCostume()?.name || "" }
    );
  };
  const ogSetSpriteCostume = vm.exports.RenderedTarget.prototype.setCostume;
  vm.exports.RenderedTarget.prototype.setCostume = function (index) {
    ogSetSpriteCostume.call(this, index);
    runtime.startHats(
      "SPlooksExpanded_whenCostumeSwitch",
      { COSTUME: this.getCurrentCostume()?.name || "" }
    );
  };

  class SPlooksExpanded {
    getInfo() {
      return {
        id: "SPlooksExpanded",
        name: Scratch.translate("Looks Expanded"),
        menuIconURI,
        blocks: [
          {
            blockType: Scratch.BlockType.XML,
            xml: `<sep gap="24"/><label text="${Scratch.translate("Looks-Expanded")}"/><sep gap="12"/>`,
          },
          {
            opcode: "getSpeech",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("speech from [TARGET]"),
            arguments: {
              TARGET: { type: Scratch.ArgumentType.STRING, menu: "TARGETS" }
            }
          },
          "---",
          {
            opcode: "costumeCnt",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("# of costumes in [TARGET]"),
            arguments: {
              TARGET: { type: Scratch.ArgumentType.STRING, menu: "TARGETS" }
            }
          },
          {
            opcode: "costumeInfo",
            blockType: Scratch.BlockType.REPORTER, 
            text: Scratch.translate("[INFO] of costume # [NUM] in [TARGET]"),
            arguments: {
              INFO: { type: Scratch.ArgumentType.STRING, menu: "COSTUME_DATA" },
              NUM: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
              TARGET: { type: Scratch.ArgumentType.STRING, menu: "TARGETS" }
            }
          },
          {
            opcode: "setTargetCostume",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("switch costume of [TARGET] to [VALUE]"),
            arguments: {
              TARGET: { type: Scratch.ArgumentType.STRING, menu: "TARGETS" },
              VALUE: { type: Scratch.ArgumentType.STRING, defaultValue: "..." },
            }
          },
          {
            opcode: "whenCostumeSwitch",
            blockType: Scratch.BlockType.EVENT,
            extensions: ["colours_event"], 
            isEdgeActivated: false,
            text: Scratch.translate("when costume switches to [COSTUME]"),
            arguments: {
              COSTUME: { type: Scratch.ArgumentType.STRING, menu: "COSTUMES" },
            }
          },
          "---",
          {
            opcode: "setSpriteEffect",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("set [EFFECT] of [TARGET] to [VALUE]"),
            arguments: {
              EFFECT: { type: Scratch.ArgumentType.STRING, menu: "EFFECT_MENU" },
              TARGET: { type: Scratch.ArgumentType.STRING, menu: "TARGETS" },
              VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }
            }
          },
          {
            opcode: "effectValue",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("[EFFECT] effect of [TARGET]"),
            arguments: {
              EFFECT: { type: Scratch.ArgumentType.STRING, menu: "EFFECT_MENU" },
              TARGET: { type: Scratch.ArgumentType.STRING, menu: "TARGETS" }
            },
          },
          {
            opcode: "tintSprite",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("set tint of [TARGET] to [COLOR]"),
            arguments: {
              TARGET: { type: Scratch.ArgumentType.STRING, menu: "TARGETS" },
              COLOR: { type: Scratch.ArgumentType.COLOR }
            }
          },
          "---",
          {
            opcode: "replaceColor",
            blockType: Scratch.BlockType.COMMAND,           
            text: Scratch.translate("replace [COLOR1] with [COLOR2] in [TARGET] softness [VALUE]"),
            arguments: {
              COLOR1: { type: Scratch.ArgumentType.COLOR },
              COLOR2: { type: Scratch.ArgumentType.COLOR },
              TARGET: { type: Scratch.ArgumentType.STRING, menu: "TARGETS" },
              VALUE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 10 },
            }
          },
          {
            opcode: "resetColor",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("reset [COLOR1] replacer in [TARGET]"),
            arguments: {
              COLOR1: { type: Scratch.ArgumentType.COLOR },
              TARGET: { type: Scratch.ArgumentType.STRING, menu: "TARGETS" }
            }
          },
          {
            opcode: "resetReplacers",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("reset color replacers in [TARGET]"),
            arguments: {
              TARGET: { type: Scratch.ArgumentType.STRING, menu: "TARGETS" }
            }
          },
          {
            blockType: Scratch.BlockType.XML,
            xml: `<sep gap="24"/><label text="${Scratch.translate("Warping and Masking")}"/><sep gap="0"/>`,
          },
          {
            opcode: "warpSprite",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("warp [TARGET] to x1: [x1] y1: [y1] x2: [x2] y2: [y2] x3: [x3] y3: [y3] x4: [x4] y4: [y4]"),
            arguments: {
              TARGET: { type: Scratch.ArgumentType.STRING, menu: "TARGETS" },
              x1: { type: Scratch.ArgumentType.NUMBER, defaultValue: -100 },
              y1: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
              x2: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
              y2: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
              x3: { type: Scratch.ArgumentType.NUMBER, defaultValue: -100 },
              y3: { type: Scratch.ArgumentType.NUMBER, defaultValue: -100 },
              x4: { type: Scratch.ArgumentType.NUMBER, defaultValue: 100 },
              y4: { type: Scratch.ArgumentType.NUMBER, defaultValue: -100 }
            },
            color1: "#a772e7",
          },
          {
            opcode: "maskSprite",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("mask [TARGET] with image [IMAGE]"),
            arguments: {
              TARGET: { type: Scratch.ArgumentType.STRING, menu: "TARGETS" },
              IMAGE: { type: Scratch.ArgumentType.STRING, defaultValue: "https://extensions.turbowarp.org/dango.png" }
            },
            color1: "#a772e7",

          },
          "---",
          {
            opcode: "showSprite",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("show [TARGET]"),
            arguments: {
              TARGET: { type: Scratch.ArgumentType.STRING, menu: "TARGETS" }
            },
            
          },
          {
            opcode: "hideSprite",
            blockType: Scratch.BlockType.COMMAND,
            text: Scratch.translate("hide [TARGET]"),
            arguments: {
              TARGET: { type: Scratch.ArgumentType.STRING, menu: "TARGETS" }
            },
          },
          {
            opcode: "spriteShowing",
            blockType: Scratch.BlockType.BOOLEAN,
            text: Scratch.translate("[TARGET] [TYPE] ?"),
            arguments: {
              TARGET: { type: Scratch.ArgumentType.STRING, menu: "TARGETS" },
              TYPE: { type: Scratch.ArgumentType.STRING, menu: "DISPLAY_TYPES" }
            },
          },
          "---",
          {
            opcode: "spriteProperty",
            blockType: Scratch.BlockType.REPORTER,
            text: Scratch.translate("[PROP] of [TARGET]"),
            arguments: {
              PROP: { type: Scratch.ArgumentType.STRING, menu: "SPRITE_PROPS" },
              TARGET: { type: Scratch.ArgumentType.STRING, menu: "TARGETS" }
            },
          },
        ],
        menus: {
          COSTUMES: { acceptReporters: false, items: "getCostumes" },
          TARGETS: { acceptReporters: true, items: "getTargets" },
          EFFECT_MENU: { acceptReporters: true, items: "getEffects" },
          DISPLAY_TYPES: {
            acceptReporters: false,
            items: [
              { text: Scratch.translate("showing"), value: "showing" },
              { text: Scratch.translate("visible"), value: "visible" }
            ]
          },
          COSTUME_DATA: {
            acceptReporters: true,
            items: [
              { text: Scratch.translate("name"), value: "name" },
              { text: Scratch.translate("type"), value: "type" },
              { text: Scratch.translate("width"), value: "width" },
              { text: Scratch.translate("height"), value: "height" },
              { text: Scratch.translate("rotation center x"), value: "rotation center x" },
              { text: Scratch.translate("rotation center y"), value: "rotation center y" },
              { text: Scratch.translate("content"), value: "content" },
              { text: Scratch.translate("data.uri"), value: "data.uri" }
            ]
          },
          SPRITE_PROPS: {
            acceptReporters: true,
            items: [
              { text: Scratch.translate("width"), value: "width" },
              { text: Scratch.translate("height"), value: "height" },
              { text: Scratch.translate("layer #"), value: "layer #" }
            ]
          },
        },
      };
    }

    // Helper Funcs
    getTargets() {
      const spriteNames = [
        { text: Scratch.translate("myself"), value: "_myself_" },
        { text: Scratch.translate("Stage"), value: "_stage_" }
      ];
      const targets = runtime.targets;
      for (let i = 1; i < targets.length; i++) {
        const target = targets[i];
        if (target.isOriginal) spriteNames.push({ text: target.getName(), value: target.getName() });
      }
      return spriteNames.length > 0 ? spriteNames : [""];
    }

    getCostumes() {
      let costumeNames = [];
      if (vm.editingTarget) costumeNames = vm.editingTarget.getCostumes().map((e) => { return e.name });
      return costumeNames.length > 0 ? costumeNames : [""];
    }

    getEffects() {
      const effects = Object.keys(vm.editingTarget?.effects || {});
      if (!isPM) effects.push("saturation", "opaque");
      effects.push("contrast", "posterize", "sepia", "bloom");
      effects.map((effect) => {
        return { text: Scratch.translate(effect), value: effect };
      });
      return effects.length > 0 ? effects : [""];
    }

    getTarget(name, util) {
      if (name === "_myself_") return util.target;
      if (name === "_stage_") return runtime.getTargetForStage();
      return runtime.getSpriteTargetByName(name);
    }

    exportCostume(costume, keepBase64) {
      const asset = costume.asset;
      if (runtime.isPackaged) {
        const skin = render._allSkins[costume.skinId];
        let type = costume.dataFormat;
        if (type === "svg") {
          const svgText = decodeURIComponent(skin._svgImage.src.split(",")[1]);
          if (keepBase64) return `data:image/svg+xml;base64,${btoa(svgText)}`;
          else return svgText;
        } else {
          // always return base 64, theres literally no point
          const gl = render.gl;
          const width = skin.size[0] * 2;
          const height = skin.size[1] * 2;

          const fbo = twgl.createFramebufferInfo(
            gl, [{ attachment: skin._texture }],
            width, height
          );
          twgl.bindFramebufferInfo(gl, fbo);
          const pixels = new Uint8Array(width * height * 4);
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext("2d");
          const imageData = ctx.createImageData(width, height);
          imageData.data.set(pixels);
          ctx.putImageData(imageData, 0, 0);
          return canvas.toDataURL("image/png");
        }
      } else {
        if (keepBase64) return asset.encodeDataURI();
        else return asset.decodeText();
      }
    }

    hex2Vec4(hex) {
      hex = hex.startsWith("#") ? hex.slice(1) : hex;
      let a = 255;
      if (hex.length === 8) a = parseInt(hex.slice(6, 8), 16);
      return [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
        a / 255
      ];
    }

    arrayMatches(arr1, arr2) {
      return arr1.every((val, i) => val === arr2[i]);
    }

    // Block Funcs
    getSpeech(args, util) {
      const target = this.getTarget(args.TARGET, util);
      if (!target) return "";
      return target._customState["Scratch.looks"]?.text || "";
    }

    costumeCnt(args, util) {
      const target = this.getTarget(args.TARGET, util);
      if (!target) return 0;
      return target.sprite.costumes.length;
    }

    costumeInfo(args, util) {
      const target = this.getTarget(args.TARGET, util);
      if (!target) return "";

      const costumes = target.getCostumes();
      const index = Cast.toNumber(args.NUM) - 1;
      const costume = costumes[index];
      if (!costume) return "";

      switch (args.INFO) {
        case "name": return costume.name;
        case "width": return costume.size[0];
        case "height": return costume.size[1];
        case "type": return costume.dataFormat;
        case "rotation center x": return costume.rotationCenterX;
        case "rotation center y": return costume.rotationCenterY;
        case "content": return this.exportCostume(costume, false);
        case "data.uri": return this.exportCostume(costume, true);
        default: return "";
      }
    }

    setTargetCostume(args, util) {
      const target = this.getTarget(args.TARGET, util);
      if (target) {
        if (target.isStage) runtime.ext_scratch3_looks._setBackdrop(target, args.VALUE);
        else runtime.ext_scratch3_looks._setCostume(target, args.VALUE);
      }
    }

    setSpriteEffect(args, util) {
      const target = this.getTarget(args.TARGET, util);
      if (target) {
        const name = Cast.toString(args.EFFECT);
        let value = Cast.toNumber(args.VALUE);
        if (name !== "posterize" && !(isPM && name === "saturation")) value /= 100;
        if (
          name === "contrast" || name === "posterize" ||
          name === "sepia" || name === "bloom" ||
          (!isPM && (name === "saturation" || name === "opaque"))
        ) {
          const drawable = render._allDrawables[target.drawableID];
          initDrawable(drawable);
          const oldValue = drawable[drawableKey].newEffects[name];
          drawable[drawableKey].newEffects[name] = value
          if (oldValue !== value) render.dirty = true;
        } else {
          target.setEffect(name, value);
        }
      }
    }

    effectValue(args, util) {
      const target = this.getTarget(args.TARGET, util);
      if (!target) return 0;

      const effects = target.effects;
      const name = Cast.toString(args.EFFECT);
      if (
        name === "contrast" || name === "posterize" ||
        name === "sepia" || name === "bloom" ||
        (!isPM && (name === "saturation" || name === "opaque"))
      ) {
        const drawable = render._allDrawables[target.drawableID];
        initDrawable(drawable);
        const value = drawable[drawableKey].newEffects[name];
        return name === "posterize" ? value : value * 100;
      }
      if (Object.prototype.hasOwnProperty.call(effects, name)) return effects[name];
      return 0;
    }

    tintSprite(args, util) {
      const target = this.getTarget(args.TARGET, util);
      if (!target) return;

      const drawable = render._allDrawables[target.drawableID];
      initDrawable(drawable);
      const oldTint = drawable[drawableKey].tint;
      drawable[drawableKey].tint = this.hex2Vec4(args.COLOR);
      if (!this.arrayMatches(oldTint, drawable[drawableKey].tint)) render.dirty = true;
    }

    replaceColor(args, util) {
      const target = this.getTarget(args.TARGET, util);
      if (!target) return;

      this.resetColor(args, util);
      const drawable = render._allDrawables[target.drawableID];
      initDrawable(drawable);
      drawable[drawableKey].replacers.push({
        targetHex: args.COLOR1,
        targetVert: this.hex2Vec4(args.COLOR1),
        replaceVert: this.hex2Vec4(args.COLOR2),
        soft: Math.max(Cast.toNumber(args.VALUE), 1) / 100
      });
      render.dirty = true;
    }

    resetColor(args, util) {
      const target = this.getTarget(args.TARGET, util);
      if (!target) return;

      const drawable = render._allDrawables[target.drawableID];
      initDrawable(drawable);
      const index = drawable[drawableKey].replacers.findIndex((i) => { return i.targetHex === args.COLOR1 });
      if (index > -1) drawable[drawableKey].replacers.splice(index, 1);
      render.dirty = true;
    }

    resetReplacers(args, util) {
      const target = this.getTarget(args.TARGET, util);
      if (!target) return;

      const drawable = render._allDrawables[target.drawableID];
      initDrawable(drawable);
      if (drawable[drawableKey].replacers.length > 0) {
        drawable[drawableKey].replacers = [];
        render.dirty = true;
      }
    }

    warpSprite(args, util) {
      const target = this.getTarget(args.TARGET, util);
      if (!target) return;

      const drawable = render._allDrawables[target.drawableID];
      initDrawable(drawable);
      const oldWarp = drawable[drawableKey].warp;
      drawable[drawableKey].warp = [
        Cast.toNumber(args.x1) / -200, Cast.toNumber(args.y1) / -200,
        Cast.toNumber(args.x2) / -200, Cast.toNumber(args.y2) / -200,
        Cast.toNumber(args.x4) / -200, Cast.toNumber(args.y4) / -200,
        Cast.toNumber(args.x3) / -200, Cast.toNumber(args.y3) / -200
      ];
      if (!this.arrayMatches(oldWarp, drawable[drawableKey].warp)) render.dirty = true;
    }

    maskSprite(args, util) {
      const target = this.getTarget(args.TARGET, util);
      if (!target) return;

      const drawable = render._allDrawables[target.drawableID];
      initDrawable(drawable);

      const url = Cast.toString(args.IMAGE);
      if (drawable[drawableKey].oldMask === url) return;
      if (!url || !(url.startsWith("data:image/") || url.startsWith("https://"))) {
        drawable[drawableKey].maskTexture = "";
        drawable[drawableKey].oldMask = "";
        drawable[drawableKey].shouldMask = 0;
        render.dirty = true;
        return;
      }
      return new Promise((resolve) => {
        const gl = render._gl;
        if (!drawable[drawableKey]._maskTexture) {
          drawable[drawableKey]._maskTexture = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, drawable[drawableKey]._maskTexture);

          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }

        // eslint-disable-next-line
        const image = new Image();
        image.crossOrigin = "Anonymous";
        image.onload = () => {
          gl.bindTexture(gl.TEXTURE_2D, drawable[drawableKey]._maskTexture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

          drawable[drawableKey].maskTexture = drawable[drawableKey]._maskTexture;
          drawable[drawableKey].shouldMask = 1;
          drawable[drawableKey].oldMask = url;
          render.dirty = true;
          resolve();
        };
        image.onerror = (e) => {
          console.warn(e);
          resolve();
        };
        image.src = url;
      });
    }

    showSprite(args, util) {
      const target = this.getTarget(args.TARGET, util);
      if (target) target.setVisible(true);
    }

    hideSprite(args, util) {
      const target = this.getTarget(args.TARGET, util);
      if (target) target.setVisible(false);
    }

    spriteShowing(args, util) {
      const target = this.getTarget(args.TARGET, util);
      if (!target || !target.visible) return false;
      if (args.TYPE === "showing") return true;
      else {
        // check if sprite is visible
        if (target.effects.ghost === 100) return false;

        // check if sprite is on-screen
        const bounds = target.getBounds();
        if (bounds.left > runtime.stageWidth / 2 || bounds.right < runtime.stageWidth / -2) return false;
        if (bounds.bottom > runtime.stageHeight / 2 || bounds.top < runtime.stageHeight / -2) return false;

        // check if sprite is being covered
        const layerInd = target.getLayerOrder() + 1;
        const rangeIds = new Array(render._allDrawables.length - layerInd);
        for (let i = 0; i < rangeIds.length; i++) { rangeIds[i] = layerInd + i }
        return !render.isTouchingDrawables(target.drawableID, rangeIds);
      }
    }

    spriteProperty(args, util) {
      const target = this.getTarget(args.TARGET, util);
      switch (args.PROP) {
        case "width": return target.getBounds().width;
        case "height": return target.getBounds().height;
        case "layer #": return target.getLayerOrder();
        default: return "";
      }
    }
  }

  // Looks Expanded class saved to local module variable.
  looksExpandedClass = SPlooksExpanded;
})(Scratch);

//Merging extension 
(function (Scratch) {
  "use strict";
  if (Scratch.extensions.__RenderingGraphicsUnifiedLoaded) return;
  Scratch.extensions.__RenderingGraphicsUnifiedLoaded = true;

  const postProcessingExt = postprocessingClass ? new postprocessingClass() : null;
  const postAIOExt = postAIOClass ? new postAIOClass() : null;
  const looksExpandedExt = looksExpandedClass ? new looksExpandedClass() : null;
  const menuIconURI = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI5Ny43MzkiIGhlaWdodD0iOTcuNzM5IiB2aWV3Qm94PSIwIDAgOTcuNzM5IDk3LjczOSI+PGcgc3Ryb2tlLW1pdGVybGltaXQ9IjEwIj48cGF0aCBkPSJNMCA0OC44N0MwIDIxLjg4IDIxLjg4IDAgNDguODcgMHM0OC44NyAyMS44OCA0OC44NyA0OC44Ny0yMS44OCA0OC44Ny00OC44NyA0OC44N1MwIDc1Ljg2IDAgNDguODciIGZpbGw9IiM2MzQyYTYiLz48cGF0aCBkPSJNNS43ODIgNDguODdjMC0yMy43OTcgMTkuMjkxLTQzLjA4OCA0My4wODgtNDMuMDg4UzkxLjk1OCAyNS4wNzMgOTEuOTU4IDQ4Ljg3IDcyLjY2NyA5MS45NTggNDguODcgOTEuOTU4IDUuNzgyIDcyLjY2NyA1Ljc4MiA0OC44NyIgZmlsbD0iIzk2ZiIvPjxwYXRoIGQ9Ik0xNi4xODYgNDQuOTk2YzQuNTMyLTUuMzEgMTYuMjE4LTE2Ljg3NCAzMi4xNzYtMTcuMDM0IDE3LjExNy0uMTcyIDI5LjMzNCAxMi41MzkgMzMuNTIgMTcuNjA0IDEuMDM5IDEuMjU4IDEuMSAyLjc2NC4xNjcgMy45MjctMy45MzUgNC45MDEtMTUuODk4IDE3LjY4Mi0zMy42ODcgMTcuNzY3LTE2Ljk1Ni4wOC0yOC43My0xMi41OS0zMi43MzYtMTcuNjI0LS45OTMtMS4yNDctLjc5My0zLjA1NC41Ni00LjY0IiBmaWxsPSIjZmZmIi8+PHBhdGggZD0iTTM1LjE0NiA0Ny42MWMwLTcuNTM2IDYuMTEtMTMuNjQ1IDEzLjY0NS0xMy42NDUgNy41MzYgMCAxMy42NDUgNi4xMSAxMy42NDUgMTMuNjQ1IDAgNy41MzYtNi4xMSAxMy42NDUtMTMuNjQ1IDEzLjY0NS03LjUzNiAwLTEzLjY0NS02LjExLTEzLjY0NS0xMy42NDUiIGZpbGw9IiM5NmYiLz48cGF0aCBkPSJNNDEuMzQyIDQ3LjYxYTcuNDQ5IDcuNDQ5IDAgMSAxIDE0Ljg5OCAwIDcuNDQ5IDcuNDQ5IDAgMCAxLTE0Ljg5OCAwIiBmaWxsPSIjZmZmIi8+PHBhdGggZD0iTTY1LjY1IDc4Ljc5YTIuOTIgMi45MiAwIDAgMS0yLjkxOC0yLjkydi02LjcxMmgtNi43MTNhMi45MiAyLjkyIDAgMCAxLTIuOTE5LTIuOTE5VjY0LjA1YTIuOTIgMi45MiAwIDAgMSAyLjkxOS0yLjkxOGg2LjcxM3YtNi43MTNBMi45MiAyLjkyIDAgMCAxIDY1LjY1IDUxLjVoMi4xOWEyLjkyIDIuOTIgMCAwIDEgMi45MTggMi45MTl2Ni43MTNoNi43MTNhMi45MiAyLjkyIDAgMCAxIDIuOTE5IDIuOTE4djIuMTlhMi45MiAyLjkyIDAgMCAxLTIuOTIgMi45MThoLTYuNzEydjYuNzEzYTIuOTIgMi45MiAwIDAgMS0yLjkxOSAyLjkxOXoiIGZpbGw9IiNmZmYiIHN0cm9rZT0iIzk2ZiIgc3Ryb2tlLXdpZHRoPSI4Ii8+PHBhdGggZD0iTTY1LjY1IDc4Ljc5YTIuOTIgMi45MiAwIDAgMS0yLjkxOC0yLjkydi02LjcxMmgtNi43MTNhMi45MiAyLjkyIDAgMCAxLTIuOTE5LTIuOTE5VjY0LjA1YTIuOTIgMi45MiAwIDAgMSAyLjkxOS0yLjkxOGg2LjcxM3YtNi43MTNBMi45MiAyLjkyIDAgMCAxIDY1LjY1IDUxLjVoMi4xOWEyLjkyIDIuOTIgMCAwIDEgMi45MTggMi45MTl2Ni43MTNoNi43MTNhMi45MiAyLjkyIDAgMCAxIDIuOTE5IDIuOTE4djIuMTlhMi45MiAyLjkyIDAgMCAxLTIuOTIgMi45MThoLTYuNzEydjYuNzEzYTIuOTIgMi45MiAwIDAgMS0yLjkxOSAyLjkxOXoiIGZpbGw9IiNmZmYiLz48L2c+PC9zdmc+";

  const vm = Scratch.vm || {};
   if (!Scratch.extensions.unsandboxed) {
    console.warn("Rendering Graphics must be loaded as an unsandboxed extension!");
  }

  function mergeInfo() {
    const info1 = postProcessingExt.getInfo();
    const info2 = postAIOExt.getInfo();
    const info3 = looksExpandedExt.getInfo();

    const merged = {
      id: "RenderingGraphics",
      name: "Rendering Graphics V1",
      color1: "#e7c0ff",
      color2: "#a772e7",
      color3: "#7B1FA2",
      menuIconURI,
      blocks: [],
      menus: {},
    };

    const allInfos = [info1, info2, info3];
    const opcodeSet = new Set();

    for (const info of allInfos) {
      if (info.blocks && Array.isArray(info.blocks)) {
        for (const block of info.blocks) {
          if (!block) continue;
          if (block.opcode) {
            if (opcodeSet.has(block.opcode)) continue;
            opcodeSet.add(block.opcode);
          }
          merged.blocks.push(block);
        }
      }
      if (info.menus && typeof info.menus === "object") {
        Object.assign(merged.menus, info.menus);
      }
      if (info.url) merged.url = info.url;
      if (info.using) merged.using = info.using;
    }

    return merged;
  }

  class RenderingGraphicsUnified {
    getInfo() {
      return mergeInfo();
    }
  }

  const sourceExts = [postAIOExt, postProcessingExt,looksExpandedExt];

  for (const source of sourceExts) {
    const proto = Object.getPrototypeOf(source);
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === "constructor" || key === "getInfo") continue;
      if (RenderingGraphicsUnified.prototype[key]) continue;
      if (typeof source[key] !== "function") continue;

      RenderingGraphicsUnified.prototype[key] = function(...args) {
        return source[key].apply(source, args);
      };
    }
  }

  Scratch.extensions.register(new RenderingGraphicsUnified());
})(Scratch);
