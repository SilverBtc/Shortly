# Patched Qwen3 TTS Demo - Base avec contrôles dynamiques
import gradio as gr
import torch
import tempfile, os
from dataclasses import asdict
from typing import List, Dict, Any, Optional
import argparse
import numpy as np

from qwen_tts import Qwen3TTSModel, VoiceClonePromptItem
from qwen_tts.cli.demo import _audio_to_tuple, _wav_to_gradio_audio, _build_choices_and_map, _detect_model_kind, _dtype_from_str, _collect_gen_kwargs
from qwen_tts.cli.demo import build_parser as orig_build_parser

def build_demo_dynamic(tts: Qwen3TTSModel, ckpt: str, gen_kwargs_default: Dict[str, Any]) -> gr.Blocks:
    model_kind = _detect_model_kind(ckpt, tts)
    # only for base in this dynamic version
    supported_langs_raw = None
    if callable(getattr(tts.model, "get_supported_languages", None)):
        supported_langs_raw = tts.model.get_supported_languages()
    supported_spks_raw = None
    if callable(getattr(tts.model, "get_supported_speakers", None)):
        supported_spks_raw = tts.model.get_supported_speakers()
    lang_choices_disp, lang_map = _build_choices_and_map([x for x in (supported_langs_raw or [])])

    def _gen_common_kwargs():
        return dict(gen_kwargs_default)

    theme = gr.themes.Soft(font=[gr.themes.GoogleFont("Source Sans Pro"), "Arial", "sans-serif"])
    css = ".gradio-container {max-width: none !important;}"

    with gr.Blocks(theme=theme, css=css) as demo:
        gr.Markdown(f"""
# Qwen3 TTS - Dynamic Voice Clone (1.7B-Base)
**Checkpoint:** `{ckpt}` | **Model Type:** `{model_kind}` | **Mode:** CPU float32
> Astuce TikTok dynamique: monte `Temperature` à 1.1 et `Subtalker Temp` à 1.05 pour plus d'énergie. Ajoute `!!!` et `...` dans ton texte.
""")
        with gr.Tabs():
            with gr.Tab("🚀 Clone Dynamique"):
                with gr.Row():
                    with gr.Column(scale=2):
                        ref_audio = gr.Audio(label="Reference Audio (3-10s, voix claire)", type="filepath")
                        ref_text = gr.Textbox(label="Reference Text (transcription exacte)", lines=2, placeholder="Transcription mot-à-mot de l'audio ref")
                        xvec_only = gr.Checkbox(label="Use x-vector only (moins fidèle, pas besoin de ref_text)", value=False)
                        gr.Markdown("⚠️ Si Generate dit 'Reference audio requis', ré-upload le wav (mp3 16kHz mono idéal)")
                    with gr.Column(scale=2):
                        text_in = gr.Textbox(label="Target Text (texte TikTok)", lines=12, placeholder="Colle ton script ici...", value="Tu crois que je vis un RÊVE avec mes galons ?! En réalité... je gagne MOINS qu'un livreur à vélo.\n\nCENT TRENTE MILLE euros de dettes — juste pour payer ma formation ! Voilà le VRAI prix... de ma casquette dorée.\n\nJe pilote un appareil à CENT MILLIONS — avec DEUX CENTS vies derrière moi — mais mon compte est à DÉCOUVERT le dix du mois !\n\nMon salaire ?! Mille cinq cents euros... BRUT !")
                        lang_in = gr.Dropdown(label="Language", choices=lang_choices_disp, value="Auto", interactive=True)
                        with gr.Accordion("🎛️ Contrôles Dynamisme (à tordre)", open=True):
                            gr.Markdown("**Temp haut = plus fou/expressif | Subtalker = prosodie/rythme**")
                            temperature = gr.Slider(0.5, 1.5, value=1.1, step=0.05, label="Temperature (0.7 plat → 1.2 très expressif)")
                            sub_temperature = gr.Slider(0.5, 1.5, value=1.05, step=0.05, label="Subtalker Temperature (rythme/intonation)")
                            top_p = gr.Slider(0.5, 1.0, value=0.95, step=0.05, label="Top-p")
                            rep_pen = gr.Slider(1.0, 1.2, value=1.05, step=0.02, label="Repetition Penalty")
                            top_k = gr.Slider(10, 100, value=50, step=5, label="Top-k")
                        btn = gr.Button("🔥 Generate DYNAMIQUE", variant="primary", size="lg")
                    with gr.Column(scale=3):
                        audio_out = gr.Audio(label="Output Audio", type="numpy")
                        err = gr.Textbox(label="Status", lines=4)

                def _resolve_ref(ref_aud):
                    # Gradio 6 returns filepath string, original helper expects (sr, wav) tuple
                    if ref_aud is None:
                        return None
                    if isinstance(ref_aud, str):
                        return ref_aud  # path direct, Qwen handles str
                    at = _audio_to_tuple(ref_aud)
                    return at

                def run_dynamic(ref_aud, ref_txt, use_xvec, text, lang_disp, temp, sub_temp, tp, rp, tk):
                    try:
                        if not text or not text.strip():
                            return None, "Target text requis."
                        at = _resolve_ref(ref_aud)
                        if at is None:
                            return None, f"Reference audio requis (upload wav/mp3). Reçu: {type(ref_aud)} {str(ref_aud)[:200]}"
                        if (not use_xvec) and (not ref_txt or not ref_txt.strip()):
                            return None, "Ref_text requis si x-vector OFF."
                        language = lang_map.get(lang_disp, "Auto")
                        kwargs = _gen_common_kwargs()
                        kwargs.update(temperature=float(temp), subtalker_temperature=float(sub_temp), top_p=float(tp), repetition_penalty=float(rp), top_k=int(tk), subtalker_top_k=int(tk), subtalker_top_p=float(tp))
                        wavs, sr = tts.generate_voice_clone(
                            text=text.strip(),
                            language=language,
                            ref_audio=at,
                            ref_text=(ref_txt.strip() if ref_txt else None),
                            x_vector_only_mode=bool(use_xvec),
                            **kwargs,
                        )
                        return _wav_to_gradio_audio(wavs[0], sr), f"OK temp={temp} sub={sub_temp} top_p={tp} | {len(wavs[0])/sr:.1f}s générés"
                    except Exception as e:
                        import traceback; traceback.print_exc()
                        return None, f"{type(e).__name__}: {e}\n{traceback.format_exc()[:800]}"

                btn.click(run_dynamic, inputs=[ref_audio, ref_text, xvec_only, text_in, lang_in, temperature, sub_temperature, top_p, rep_pen, top_k], outputs=[audio_out, err])

            with gr.Tab("💾 Save / Load Voice"):
                with gr.Row():
                    with gr.Column(scale=2):
                        ref_audio_s = gr.Audio(label="Reference Audio", type="numpy")
                        ref_text_s = gr.Textbox(label="Reference Text", lines=2)
                        xvec_only_s = gr.Checkbox(label="Use x-vector only", value=False)
                        save_btn = gr.Button("Save Voice File", variant="primary")
                        prompt_file_out = gr.File(label="Voice File")
                    with gr.Column(scale=2):
                        prompt_file_in = gr.File(label="Upload Prompt File")
                        text_in2 = gr.Textbox(label="Target Text", lines=4)
                        lang_in2 = gr.Dropdown(label="Language", choices=lang_choices_disp, value="Auto", interactive=True)
                        with gr.Accordion("🎛️ Dynamisme", open=False):
                            temperature2 = gr.Slider(0.5, 1.5, value=1.1, step=0.05, label="Temperature")
                            sub_temperature2 = gr.Slider(0.5, 1.5, value=1.05, step=0.05, label="Subtalker Temp")
                            top_p2 = gr.Slider(0.5, 1.0, value=0.95, step=0.05, label="Top-p")
                        gen_btn2 = gr.Button("Generate", variant="primary")
                    with gr.Column(scale=3):
                        audio_out2 = gr.Audio(label="Output", type="numpy")
                        err2 = gr.Textbox(label="Status", lines=2)

                def save_prompt(ref_aud, ref_txt, use_xvec):
                    try:
                        at = _resolve_ref(ref_aud)
                        if at is None:
                            return None, "Ref audio requis."
                        if (not use_xvec) and (not ref_txt or not ref_txt.strip()):
                            return None, "Ref_text requis."
                        items = tts.create_voice_clone_prompt(ref_audio=at, ref_text=(ref_txt.strip() if ref_txt else None), x_vector_only_mode=bool(use_xvec))
                        payload = {"items": [asdict(it) for it in items]}
                        fd, out_path = tempfile.mkstemp(prefix="voice_clone_prompt_", suffix=".pt")
                        os.close(fd)
                        torch.save(payload, out_path)
                        return out_path, "Saved."
                    except Exception as e:
                        return None, f"{type(e).__name__}: {e}"

                def load_prompt_and_gen(file_obj, text, lang_disp, temp, sub_temp, tp):
                    try:
                        if file_obj is None:
                            return None, "Voice file requis."
                        if not text or not text.strip():
                            return None, "Text requis."
                        import torch as _torch
                        path = getattr(file_obj, "name", None) or getattr(file_obj, "path", None) or str(file_obj)
                        payload = _torch.load(path, map_location="cpu", weights_only=True)
                        items_raw = payload["items"]
                        items: List[VoiceClonePromptItem] = []
                        for d in items_raw:
                            ref_code = d.get("ref_code", None)
                            if ref_code is not None and not _torch.is_tensor(ref_code):
                                ref_code = _torch.tensor(ref_code)
                            ref_spk = d.get("ref_spk_embedding", None)
                            if not _torch.is_tensor(ref_spk):
                                ref_spk = _torch.tensor(ref_spk)
                            items.append(VoiceClonePromptItem(ref_code=ref_code, ref_spk_embedding=ref_spk, x_vector_only_mode=bool(d.get("x_vector_only_mode", False)), icl_mode=bool(d.get("icl_mode", not bool(d.get("x_vector_only_mode", False)))), ref_text=d.get("ref_text", None)))
                        language = lang_map.get(lang_disp, "Auto")
                        kwargs = _gen_common_kwargs()
                        kwargs.update(temperature=float(temp), subtalker_temperature=float(sub_temp), top_p=float(tp), subtalker_top_p=float(tp))
                        wavs, sr = tts.generate_voice_clone(text=text.strip(), language=language, voice_clone_prompt=items, **kwargs)
                        return _wav_to_gradio_audio(wavs[0], sr), "OK"
                    except Exception as e:
                        return None, f"{type(e).__name__}: {e}"

                save_btn.click(save_prompt, inputs=[ref_audio_s, ref_text_s, xvec_only_s], outputs=[prompt_file_out, err2])
                gen_btn2.click(load_prompt_and_gen, inputs=[prompt_file_in, text_in2, lang_in2, temperature2, sub_temperature2, top_p2], outputs=[audio_out2, err2])

        gr.Markdown("**Base 1.7B | CPU float32 | Tweaked for TikTok** — si c'est trop fou, baisse temperature à 0.95")
    return demo

def main():
    parser = orig_build_parser()
    args = parser.parse_args()
    from qwen_tts.cli.demo import _resolve_checkpoint, _dtype_from_str, _collect_gen_kwargs
    if not args.checkpoint and not args.checkpoint_pos:
        parser.print_help(); return 0
    ckpt = _resolve_checkpoint(args)
    dtype = _dtype_from_str(args.dtype)
    attn = "flash_attention_2" if args.flash_attn else None
    print(f"Loading {ckpt} on {args.device} dtype={args.dtype} ...")
    tts = Qwen3TTSModel.from_pretrained(ckpt, device_map=args.device, dtype=dtype, attn_implementation=attn)
    gen_kwargs_default = _collect_gen_kwargs(args)
    demo = build_demo_dynamic(tts, ckpt, gen_kwargs_default)
    demo.queue(default_concurrency_limit=int(args.concurrency)).launch(server_name=args.ip, server_port=args.port, share=args.share, ssl_verify=True if args.ssl_verify else False)

if __name__ == "__main__":
    main()
